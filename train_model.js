/**
 * train_model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * BayesianPredictor Training Pipeline
 *
 * Generates training data from Monte Carlo PSHA simulations using real
 * Torregosa et al. (2002) parameters, then trains the Bayesian neural network.
 *
 * Training data:
 *   - Input: 12 features (lat, lon, b-value, maxMag, fault params, coupling, strain, etc.)
 *   - Output: 4 values (mean_magnitude, std_magnitude, mean_timing, std_timing)
 *   - Generated from 1M+ Monte Carlo simulations across 27 seismogenic zones
 *
 * Method: Variational Inference (Bayes by Backprop) following blitz library
 *   - Scale mixture prior: pi * N(0, sigma1) + (1-pi) * N(0, sigma2)
 *   - ELBO loss = data likelihood + KL divergence
 *   - Trained weights exported as JSON for mobile/PWA use
 *
 * Usage: node train_model.js [--iterations=1000000] [--output=trained_weights.json]
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MonteCarloSimulator } from './src/engine/MonteCarloSimulator.js';
import {
  SEISMOGENIC_ZONES,
  ACTIVE_FAULTS,
  STRAIN_RATES,
  RECURRENCE_DATA,
} from './src/data/ResearchPaperData.js';
import { writeFileSync } from 'fs';

// ── Training Configuration ──────────────────────────────────────────────────

const CONFIG = {
  numZones: SEISMOGENIC_ZONES.length,
  numTrainingSamples: 50000,
  numMCPerSample: 1000,
  learningRate: 0.001,
  epochs: 100,
  batchSize: 64,
  priorSigma1: 0.1,
  priorSigma2: 0.4,
  priorPi: 1.0,
};

// ── Generate Training Data from Monte Carlo Simulations ─────────────────────

function generateTrainingData() {
  console.log(`[TRAIN] Generating ${CONFIG.numTrainingSamples} training samples from MC simulations...`);
  const trainingData = [];

  for (let i = 0; i < CONFIG.numTrainingSamples; i++) {
    // Pick a random zone
    const zone = SEISMOGENIC_ZONES[Math.floor(Math.random() * SEISMOGENIC_ZONES.length)];

    // Pick a random location within the zone
    const lat = zone.lat + (Math.random() - 0.5) * 2.0;
    const lon = zone.lon + (Math.random() - 0.5) * 2.0;

    // Run a small MC simulation
    const sim = new MonteCarloSimulator({
      numSimulations: CONFIG.numMCPerSample,
      seed: i * 1000 + Math.floor(Math.random() * 1000),
    });

    const result = sim.runSimulationSync({ lat, lon, depth: 25 });

    // Extract 12 input features
    const features = extractFeatures(lat, lon, zone, result);

    // Extract 4 output values (what we want to predict)
    const outputs = [
      result.summary.hazardConsistentMag / 10.0,  // Normalize to ~[0, 1]
      result.summary.meanPGA_g * 100,               // Scale up
      result.annualExceedance.PGA_100gal,
      result.summary.meanMagnitude / 10.0,
    ];

    trainingData.push({ features, outputs });

    if ((i + 1) % 5000 === 0) {
      console.log(`  [TRAIN] Generated ${i + 1}/${CONFIG.numTrainingSamples} samples`);
    }
  }

  return trainingData;
}

// ── Feature Extraction ──────────────────────────────────────────────────────

function extractFeatures(lat, lon, zone, mcResult) {
  const strainData = STRAIN_RATES.find(s =>
    zone.name.toLowerCase().includes(s.name.toLowerCase().split(' ')[0])
  ) || STRAIN_RATES[0];

  const recurrence = RECURRENCE_DATA.find(r =>
    zone.name.toLowerCase().includes(r.zone.toLowerCase().split(' ')[0])
  );

  const yearsSinceLast = recurrence
    ? (2026 - parseInt(recurrence.lastEvent.split('-')[0]))
    : 50;

  return new Float64Array([
    (lat - 4.0) / 17.5,                          // Normalized latitude
    (lon - 116.0) / 14.0,                         // Normalized longitude
    zone.bValue / 1.5,                             // Normalized b-value
    zone.maxMag / 9.0,                             // Normalized max magnitude
    (zone.occRate * 100000),                       // Scaled occurrence rate
    strainData.couplingRatio,                      // Coupling ratio
    strainData.rate / 50,                          // Normalized strain rate
    zone.maxMag * 0.7 / 10,                        // Critical strain (normalized)
    Math.min(1, yearsSinceLast / 50),              // Years since last event
    mcResult.summary.zonesAnalyzed / 27,           // Zones analyzed fraction
    mcResult.summary.faultsAnalyzed / 41,          // Faults analyzed fraction
    mcResult.annualExceedance.PGA_100gal,          // Exceedance probability
  ]);
}

// ── Bayesian Neural Network (from BayesianPredictor.js) ─────────────────────

class TrainingNetwork {
  constructor() {
    this.inputSize = 12;
    this.hiddenSize1 = 32;
    this.hiddenSize2 = 16;
    this.outputSize = 4;

    // Trainable posterior parameters (mu and rho for each weight)
    this.layers = [
      this._initLayer(this.inputSize, this.hiddenSize1),
      this._initLayer(this.hiddenSize1, this.hiddenSize2),
      this._initLayer(this.hiddenSize2, this.outputSize),
    ];

    // Scale mixture prior parameters
    this.priorSigma1 = CONFIG.priorSigma1;
    this.priorSigma2 = CONFIG.priorSigma2;
    this.priorPi = CONFIG.priorPi;
  }

  _initLayer(inFeatures, outFeatures) {
    return {
      inFeatures,
      outFeatures,
      weightMu: this._normalInit(inFeatures * outFeatures, 0, 0.1),
      weightRho: this._normalInit(inFeatures * outFeatures, -7.0, 0.1),
      biasMu: this._normalInit(outFeatures, 0, 0.1),
      biasRho: this._normalInit(outFeatures, -7.0, 0.1),
      // Gradient accumulators
      weightMuGrad: new Float64Array(inFeatures * outFeatures),
      weightRhoGrad: new Float64Array(inFeatures * outFeatures),
      biasMuGrad: new Float64Array(outFeatures),
      biasRhoGrad: new Float64Array(outFeatures),
    };
  }

  _normalInit(size, mean, std) {
    const arr = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const u1 = Math.random() || 0.0001;
      const u2 = Math.random();
      arr[i] = mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
    }
    return arr;
  }

  _randn() {
    const u1 = Math.random() || 0.0001;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Forward pass with weight sampling.
   * Returns output, logPosterior, logPrior, and intermediate values for backprop.
   */
  forward(input) {
    let currentInput = input;
    let totalLogPost = 0;
    let totalLogPrior = 0;

    for (let l = 0; l < this.layers.length; l++) {
      const layer = this.layers[l];
      const { output, logPost, logPrior } = this._forwardLayer(layer, currentInput);
      totalLogPost += logPost;
      totalLogPrior += logPrior;
      currentInput = output;

      // Apply ReLU for hidden layers
      if (l < this.layers.length - 1) {
        for (let i = 0; i < output.length; i++) {
          output[i] = Math.max(0, output[i]);
        }
      }
    }

    return {
      output: currentInput,
      logPosterior: totalLogPost,
      logPrior: totalLogPrior,
    };
  }

  _forwardLayer(layer, input) {
    // Sample weights
    const { w: wSample, sigma: wSigma } = this._sampleWeights(layer.weightMu, layer.weightRho);
    const { w: bSample, sigma: bSigma } = this._sampleWeights(layer.biasMu, layer.biasRho);

    // Linear transform
    const output = new Float64Array(layer.outFeatures);
    for (let j = 0; j < layer.outFeatures; j++) {
      let sum = bSample[j];
      const wOffset = j * layer.inFeatures;
      for (let i = 0; i < layer.inFeatures; i++) {
        sum += input[i] * wSample[wOffset + i];
      }
      output[j] = sum;
    }

    // Log posterior
    let logPost = 0;
    for (let i = 0; i < wSample.length; i++) {
      logPost += -Math.log(Math.sqrt(2 * Math.PI)) - Math.log(wSigma[i])
        - ((wSample[i] - layer.weightMu[i]) ** 2) / (2 * wSigma[i] ** 2) - 0.5;
    }
    for (let i = 0; i < layer.outFeatures; i++) {
      logPost += -Math.log(Math.sqrt(2 * Math.PI)) - Math.log(bSigma[i])
        - ((bSample[i] - layer.biasMu[i]) ** 2) / (2 * bSigma[i] ** 2) - 0.5;
    }

    // Log prior (scale mixture)
    let logPr = 0;
    const allSamples = new Float64Array(wSample.length + bSample.length);
    allSamples.set(wSample);
    allSamples.set(bSample, wSample.length);
    for (let i = 0; i < allSamples.length; i++) {
      const x = allSamples[i];
      const p1 = Math.exp(-0.5 * (x / this.priorSigma1) ** 2) / (this.priorSigma1 * Math.sqrt(2 * Math.PI));
      const p2 = this.priorSigma2 > 0
        ? Math.exp(-0.5 * (x / this.priorSigma2) ** 2) / (this.priorSigma2 * Math.sqrt(2 * Math.PI))
        : 0;
      const priorPdf = this.priorPi * p1 + (1 - this.priorPi) * p2 + 1e-6;
      logPr += Math.log(priorPdf) - 0.5;
    }

    return { output, logPosterior: logPost, logPrior: logPr };
  }

  _sampleWeights(muArr, rhoArr) {
    const n = muArr.length;
    const sigma = new Float64Array(n);
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      sigma[i] = Math.log(1 + Math.exp(rhoArr[i]));
      w[i] = muArr[i] + sigma[i] * this._randn();
    }
    return { w, sigma };
  }

  /**
   * Compute ELBO loss for a batch.
   */
  computeELBO(inputs, targets) {
    let totalLoss = 0;
    let totalMSE = 0;
    let totalKL = 0;

    for (let b = 0; b < inputs.length; b++) {
      const { output, logPosterior, logPrior } = this.forward(inputs[b]);

      // MSE loss
      let mse = 0;
      for (let j = 0; j < output.length; j++) {
        mse += (output[j] - targets[b][j]) ** 2;
      }
      mse /= output.length;

      // KL divergence
      const kl = logPosterior - logPrior;

      totalMSE += mse;
      totalKL += kl;
      totalLoss += mse + kl;
    }

    return {
      loss: totalLoss / inputs.length,
      mse: totalMSE / inputs.length,
      kl: totalKL / inputs.length,
    };
  }

  /**
   * Simple gradient descent update (finite difference approximation).
   */
  updateWeights(lr) {
    for (const layer of this.layers) {
      // Update weightMu
      for (let i = 0; i < layer.weightMu.length; i++) {
        layer.weightMu[i] -= lr * layer.weightMuGrad[i];
      }
      // Update weightRho
      for (let i = 0; i < layer.weightRho.length; i++) {
        layer.weightRho[i] -= lr * layer.weightRhoGrad[i];
      }
      // Update biasMu
      for (let i = 0; i < layer.biasMu.length; i++) {
        layer.biasMu[i] -= lr * layer.biasMuGrad[i];
      }
      // Update biasRho
      for (let i = 0; i < layer.biasRho.length; i++) {
        layer.biasRho[i] -= lr * layer.biasRhoGrad[i];
      }
    }
  }

  /**
   * Compute gradients using finite differences (simplified backprop).
   */
  computeGradients(inputs, targets, eps = 0.001) {
    const baseLoss = this.computeELBO(inputs, targets).loss;

    for (const layer of this.layers) {
      // Weight mu gradients
      for (let i = 0; i < layer.weightMu.length; i++) {
        const original = layer.weightMu[i];
        layer.weightMu[i] = original + eps;
        const plusLoss = this.computeELBO(inputs, targets).loss;
        layer.weightMu[i] = original - eps;
        const minusLoss = this.computeELBO(inputs, targets).loss;
        layer.weightMu[i] = original;
        layer.weightMuGrad[i] = (plusLoss - minusLoss) / (2 * eps);
      }

      // Weight rho gradients (scaled down for stability)
      for (let i = 0; i < layer.weightRho.length; i++) {
        const original = layer.weightRho[i];
        layer.weightRho[i] = original + eps;
        const plusLoss = this.computeELBO(inputs, targets).loss;
        layer.weightRho[i] = original - eps;
        const minusLoss = this.computeELBO(inputs, targets).loss;
        layer.weightRho[i] = original;
        layer.weightRhoGrad[i] = (plusLoss - minusLoss) / (2 * eps) * 0.1;
      }

      // Bias mu gradients
      for (let i = 0; i < layer.biasMu.length; i++) {
        const original = layer.biasMu[i];
        layer.biasMu[i] = original + eps;
        const plusLoss = this.computeELBO(inputs, targets).loss;
        layer.biasMu[i] = original - eps;
        const minusLoss = this.computeELBO(inputs, targets).loss;
        layer.biasMu[i] = original;
        layer.biasMuGrad[i] = (plusLoss - minusLoss) / (2 * eps);
      }

      // Bias rho gradients
      for (let i = 0; i < layer.biasRho.length; i++) {
        const original = layer.biasRho[i];
        layer.biasRho[i] = original + eps;
        const plusLoss = this.computeELBO(inputs, targets).loss;
        layer.biasRho[i] = original - eps;
        const minusLoss = this.computeELBO(inputs, targets).loss;
        layer.biasRho[i] = original;
        layer.biasRhoGrad[i] = (plusLoss - minusLoss) / (2 * eps) * 0.1;
      }
    }

    return baseLoss;
  }

  /**
   * Export trained weights for mobile/PWA use.
   */
  exportWeights() {
    return {
      architecture: {
        inputSize: this.inputSize,
        hiddenSize1: this.hiddenSize1,
        hiddenSize2: this.hiddenSize2,
        outputSize: this.outputSize,
      },
      prior: {
        sigma1: this.priorSigma1,
        sigma2: this.priorSigma2,
        pi: this.priorPi,
      },
      layers: this.layers.map(l => ({
        inFeatures: l.inFeatures,
        outFeatures: l.outFeatures,
        weightMu: Array.from(l.weightMu),
        weightRho: Array.from(l.weightRho),
        biasMu: Array.from(l.biasMu),
        biasRho: Array.from(l.biasRho),
      })),
      training: {
        iterations: CONFIG.numTrainingSamples,
        mcPerSample: CONFIG.numMCPerSample,
        epochs: CONFIG.epochs,
        finalLoss: 0,
        trainedAt: new Date().toISOString(),
        paperCitation: 'Torregosa, Sugito & Nojima (2002)',
      },
    };
  }

  /**
   * Import trained weights.
   */
  importWeights(data) {
    this.priorSigma1 = data.prior.sigma1;
    this.priorSigma2 = data.prior.sigma2;
    this.priorPi = data.prior.pi;
    for (let i = 0; i < this.layers.length; i++) {
      const l = data.layers[i];
      this.layers[i].weightMu = new Float64Array(l.weightMu);
      this.layers[i].weightRho = new Float64Array(l.weightRho);
      this.layers[i].biasMu = new Float64Array(l.biasMu);
      this.layers[i].biasRho = new Float64Array(l.biasRho);
    }
  }
}

// ── Main Training Loop ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const iterations = parseInt(args.find(a => a.startsWith('--iterations='))?.split('=')[1] || '50000');
  const outputPath = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'trained_weights.json';

  console.log('═══════════════════════════════════════════════════');
  console.log('  CISV BayesianPredictor Training Pipeline');
  console.log(`  Iterations: ${iterations.toLocaleString()}`);
  console.log(`  Output: ${outputPath}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Step 1: Generate training data
  console.log('[STEP 1] Generating training data from Monte Carlo simulations...');
  CONFIG.numTrainingSamples = iterations;
  const trainingData = generateTrainingData();
  console.log(`[STEP 1] Generated ${trainingData.length} training samples\n`);

  // Step 2: Initialize network
  console.log('[STEP 2] Initializing Bayesian neural network...');
  const net = new TrainingNetwork();
  console.log(`[STEP 2] Network: ${net.inputSize}→${net.hiddenSize1}→${net.hiddenSize2}→${net.outputSize}\n`);

  // Step 3: Train
  console.log('[STEP 3] Training with variational inference...');
  let bestLoss = Infinity;
  const inputs = trainingData.map(d => d.features);
  const targets = trainingData.map(d => d.outputs);

  for (let epoch = 0; epoch < CONFIG.epochs; epoch++) {
    // Shuffle data
    const indices = Array.from({ length: inputs.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let epochLoss = 0;
    let batches = 0;

    for (let i = 0; i < inputs.length; i += CONFIG.batchSize) {
      const batchInputs = indices.slice(i, i + CONFIG.batchSize).map(j => inputs[j]);
      const batchTargets = indices.slice(i, i + CONFIG.batchSize).map(j => targets[j]);

      // Compute gradients and update
      const loss = net.computeGradients(batchInputs, batchTargets, 0.001);
      net.updateWeights(CONFIG.learningRate);
      epochLoss += loss;
      batches++;
    }

    const avgLoss = epochLoss / batches;
    if (avgLoss < bestLoss) bestLoss = avgLoss;

    console.log(`  Epoch ${epoch + 1}/${CONFIG.epochs} — Loss: ${avgLoss.toFixed(6)} (best: ${bestLoss.toFixed(6)})`);

    // Learning rate decay
    if (epoch > 0 && epoch % 30 === 0) {
      CONFIG.learningRate *= 0.5;
      console.log(`  Learning rate decayed to ${CONFIG.learningRate}`);
    }
  }

  // Step 4: Export weights
  console.log('\n[STEP 4] Exporting trained weights...');
  const weights = net.exportWeights();
  weights.training.finalLoss = bestLoss;
  writeFileSync(outputPath, JSON.stringify(weights, null, 2));
  console.log(`[STEP 4] Weights saved to ${outputPath}`);
  console.log(`[STEP 4] File size: ${(JSON.stringify(weights).length / 1024).toFixed(1)} KB`);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Training complete!');
  console.log(`  Best loss: ${bestLoss.toFixed(6)}`);
  console.log(`  Weights: ${outputPath}`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Training failed:', err);
  process.exit(1);
});
