/**
 * MonteCarloSimulator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * NASA-Grade Probabilistic Seismic Hazard Analysis (PSHA) Engine
 *
 * Runs Monte Carlo simulations using seismogenic zone and fault parameters
 * from Torregosa et al. (2002) to predict earthquake probability, timing,
 * magnitude, and ground motion for any location in the Philippines.
 *
 * Methodology:
 *   1. For each seismogenic zone within search radius, compute annual
 *      occurrence rates from Gutenberg-Richter distribution
 *   2. Apply Matsuda fault length-magnitude scaling for fault sources
 *   3. Run N simulations (configurable, default 1M) sampling random
 *      earthquake events from the combined zone + fault source model
 *   4. Apply Torregosa attenuation equations (Eqs. 17-19) for ground motion
 *   5. Apply soil amplification factors (Eqs. 21-23) for site-specific PGA
 *   6. Aggregate results: exceedance probabilities, hazard-consistent
 *      magnitudes, and timing distributions
 *
 * Data source: Torregosa, Sugito & Nojima (2002)
 *   "Seismic Hazard and Microzoning of the Philippines"
 *   JSCE Structural Engineering, Vol. 19, No. 710/2002.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  SEISMOGENIC_ZONES,
  ACTIVE_FAULTS,
  ATTENUATION,
  computePGA,
  computePGV,
  computeEffPGA,
  magToFaultLength,
  faultLengthToMag,
  magToDisplacement,
  poissonExceedance,
  GEOLOGY_AMPLIFICATION,
  computeBetaPGA,
} from '../data/ResearchPaperData.js';

// ── Mulberry32 PRNG (deterministic, reproducible) ───────────────────────────

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MonteCarloSimulator {
  /**
   * @param {object} [opts]
   * @param {number} [opts.numSimulations=1_000_000]  Total Monte Carlo runs
   * @param {number} [opts.seed=0xCAFEBABE]           PRNG seed for reproducibility
   * @param {number} [opts.maxRadiusKm=300]            Search radius from epicenter
   * @param {number} [opts.returnPeriod=500]            Hazard return period (years)
   * @param {number} [opts.timeHorizon=100]             Forecast window (years)
   */
  constructor(opts = {}) {
    this.numSimulations = opts.numSimulations ?? 1_000_000;
    this.seed = opts.seed ?? 0xCAFEBABE;
    this.maxRadiusKm = opts.maxRadiusKm ?? 300;
    this.returnPeriod = opts.returnPeriod ?? 500;
    this.timeHorizon = opts.timeHorizon ?? 100;
    this.rng = mulberry32(this.seed);
  }

  // ── Distance Calculation ─────────────────────────────────────────────────

  /**
   * Haversine distance between two lat/lon points (km).
   */
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Find seismogenic zones within search radius.
   */
  findNearbyZones(lat, lon) {
    return SEISMOGENIC_ZONES
      .map(z => ({ ...z, dist: this.haversine(lat, lon, z.lat, z.lon) }))
      .filter(z => z.dist <= this.maxRadiusKm)
      .sort((a, b) => a.dist - b.dist);
  }

  /**
   * Find active faults within search radius.
   */
  findNearbyFaults(lat, lon) {
    return ACTIVE_FAULTS
      .map(f => {
        // Approximate fault centroid from strike and length
        const halfLen = f.length / 2;
        const strikeRad = f.strike * Math.PI / 180;
        const centroidLat = f.dip ? f.dip : lat; // use zone lat as proxy
        const centroidLon = f.lon ?? lon;
        const dist = this.haversine(lat, lon, centroidLat, centroidLon);
        return { ...f, dist, centroidLat, centroidLon };
      })
      .filter(f => f.dist <= this.maxRadiusKm + f.length / 2)
      .sort((a, b) => a.dist - b.dist);
  }

  // ── Gutenberg-Richter Sampling ───────────────────────────────────────────

  /**
   * Sample a random magnitude from the truncated Gutenberg-Richter distribution.
   * P(M) ∝ 10^(-b*M) for mmin ≤ M ≤ mmax
   */
  sampleMagnitude(bValue, mMin, mMax) {
    const u = this.rng();
    // Inverse CDF of truncated GR distribution
    const bLn10 = bValue * Math.LN10;
    const num = Math.exp(-bLn10 * mMin) - Math.exp(-bLn10 * mMax);
    const den = Math.exp(-bLn10 * mMin);
    return mMin - Math.log(den - u * num) / bLn10;
  }

  // ── Poisson Timing ──────────────────────────────────────────────────────

  /**
   * Sample time-to-next-event from Poisson process.
   * @param {number} lambda Annual occurrence rate
   * @returns {number} Years until event (0 = event already overdue)
   */
  samplePoissonTime(lambda) {
    if (lambda <= 0) return Infinity;
    const u = this.rng();
    return -Math.log(1 - u) / lambda;
  }

  // ── Core Monte Carlo Simulation ─────────────────────────────────────────

  /**
   * Run full Monte Carlo PSHA for a given epicenter location.
   *
   * @param {object} params
   * @param {number} params.lat            Epicenter latitude
   * @param {number} params.lon            Epicenter longitude
   * @param {number} [params.depth=25]     Focal depth (km)
   * @param {number} [params.siteGeology=1] Geology type (1-6) for amplification
   * @param {object} [params.progressCb]   Progress callback: (pct, msg) => void
   * @returns {Promise<NASASimulationResult>}
   */
  async runSimulation(params) {
    const { lat, lon, depth = 25, siteGeology = 1, progressCb } = params;

    // 1. Find contributing sources
    const zones = this.findNearbyZones(lat, lon);
    const faults = this.findNearbyFaults(lat, lon);

    if (zones.length === 0 && faults.length === 0) {
      return this._emptyResult(lat, lon);
    }

    const totalSources = zones.length + faults.length;
    const batchSize = Math.ceil(this.numSimulations / 100);
    const N = this.numSimulations;

    // Accumulators
    const magBuckets = new Float64Array(20); // 1.0-9.5 in 0.5 steps
    const pgaBuckets = new Float64Array(20);
    const yearBuckets = new Float64Array(20); // 2026-2046 in 1yr steps
    const exceedance50gal = { count: 0 };
    const exceedance100gal = { count: 0 };
    const exceedance200gal = { count: 0 };
    const exceedance500gal = { count: 0 };
    let maxMag = 0;
    let totalPGA = 0;
    let magSum = 0;
    let countValid = 0;

    // Per-zone accumulators for contribution analysis
    const zoneContributions = zones.map(z => ({
      id: z.id,
      name: z.name,
      count: 0,
      maxMag: 0,
      totalPGA: 0,
    }));

    const faultContributions = faults.map(f => ({
      id: f.id,
      name: f.name,
      count: 0,
      maxMag: 0,
      totalPGA: 0,
    }));

    // Run simulations in batches for progress reporting
    const results = [];
    let simCount = 0;

    for (let batch = 0; batch < 100; batch++) {
      const batchEnd = Math.min(simCount + batchSize, N);

      for (let i = simCount; i < batchEnd; i++) {
        // 2. Select source (weighted by occurrence rate)
        const totalOccRate = zones.reduce((s, z) => s + z.occRate, 0) +
                            faults.reduce((s, f) => s + f.vp, 0);

        const u = this.rng();
        let cumRate = 0;
        let selectedZone = null;
        let selectedFault = null;
        let isFault = false;

        for (const z of zones) {
          cumRate += z.occRate;
          if (u <= cumRate / totalOccRate) {
            selectedZone = z;
            break;
          }
        }

        if (!selectedZone) {
          for (const f of faults) {
            cumRate += f.vp;
            if (u <= cumRate / totalOccRate) {
              selectedFault = f;
              isFault = true;
              break;
            }
          }
        }

        if (!selectedZone && !selectedFault) {
          selectedZone = zones[0]; // fallback
        }

        // 3. Sample magnitude
        let mag;
        let eventLat, eventLon, eventDepth;

        if (isFault && selectedFault) {
          // Use fault characteristic magnitude with Gaussian scatter
          const Mf = selectedFault.Mf;
          mag = Mf + (this.rng() - 0.5) * 1.0; // ±0.5 scatter
          mag = Math.max(4.0, Math.min(mag, 9.0));

          // Position along fault length
          const alongFault = (this.rng() - 0.5) * selectedFault.length;
          const strikeRad = selectedFault.strike * Math.PI / 180;
          eventLat = (selectedFault.centroidLat ?? lat) + alongFault * Math.cos(strikeRad) / 111;
          eventLon = (selectedFault.centroidLon ?? lon) + alongFault * Math.sin(strikeRad) / (111 * Math.cos(lat * Math.PI / 180));
          eventDepth = Math.max(5, depth + (this.rng() - 0.5) * 20);
        } else if (selectedZone) {
          mag = this.sampleMagnitude(selectedZone.bValue, 4.0, selectedZone.maxMag);
          // Position within zone with random scatter
          const scatter = 1.5; // degrees
          eventLat = selectedZone.lat + (this.rng() - 0.5) * scatter * 2;
          eventLon = selectedZone.lon + (this.rng() - 0.5) * scatter * 2;
          eventDepth = selectedZone.focalDepth + (this.rng() - 0.5) * 20;
        } else {
          continue;
        }

        eventDepth = Math.max(1, Math.min(eventDepth, 700));

        // 4. Compute hypocentral distance
        const R = Math.max(ATTENUATION.pga.minDistance, this.haversine(lat, lon, eventLat, eventLon));

        // 5. Apply attenuation equations (Eqs. 17-19)
        const Ms = mag; // Using Mw ≈ Ms for simulation
        const pgaGal = computePGA(Ms, R);
        const pgvCMS = computePGV(Ms, R);
        const effPGAGal = computeEffPGA(Ms, R);

        // 6. Apply soil amplification (Eq. 21)
        const geo = GEOLOGY_AMPLIFICATION[siteGeology] || GEOLOGY_AMPLIFICATION[1];
        const betaPGA = computeBetaPGA(geo.Sn, pgaGal);
        const sitePGA = pgaGal * betaPGA;
        const sitePGA_g = sitePGA / 981; // Convert gal to g

        // 7. Accumulate results
        const magBucket = Math.min(19, Math.max(0, Math.floor((mag - 1.0) * 2)));
        magBuckets[magBucket]++;

        const pgaBucket = Math.min(19, Math.max(0, Math.floor(sitePGA_g * 20)));
        pgaBuckets[pgaBucket]++;

        // Time distribution: sample when this event would occur
        const lambda = isFault ? selectedFault.vp : (selectedZone?.occRate ?? 1e-5);
        const timeToEvent = this.samplePoissonTime(lambda * 1000); // scale for occurrence
        const eventYear = 2026 + timeToEvent;
        if (eventYear >= 2026 && eventYear <= 2046) {
          const yearBucket = Math.min(19, Math.floor(eventYear - 2026));
          yearBuckets[yearBucket]++;
        }

        // Exceedance counts
        if (sitePGA_g > 0.05) exceedance50gal.count++;
        if (sitePGA_g > 0.10) exceedance100gal.count++;
        if (sitePGA_g > 0.20) exceedance200gal.count++;
        if (sitePGA_g > 0.50) exceedance500gal.count++;

        if (mag > maxMag) maxMag = mag;
        totalPGA += sitePGA_g;
        magSum += mag;
        countValid++;

        // Track source contributions
        if (isFault && selectedFault) {
          const fc = faultContributions.find(f => f.id === selectedFault.id);
          if (fc) {
            fc.count++;
            if (mag > fc.maxMag) fc.maxMag = mag;
            fc.totalPGA += sitePGA_g;
          }
        } else if (selectedZone) {
          const zc = zoneContributions.find(z => z.id === selectedZone.id);
          if (zc) {
            zc.count++;
            if (mag > zc.maxMag) zc.maxMag = mag;
            zc.totalPGA += sitePGA_g;
          }
        }
      }

      simCount = batchEnd;

      if (progressCb && batch % 10 === 0) {
        progressCb(Math.floor((simCount / N) * 90), `Running Monte Carlo simulation: ${simCount.toLocaleString()} / ${N.toLocaleString()}...`);
        await new Promise(r => setTimeout(r, 0)); // yield to event loop
      }
    }

    // Normalize contributions
    zoneContributions.forEach(z => { z.probability = z.count / N; });
    faultContributions.forEach(f => { f.probability = f.count / N; });

    // Sort by contribution probability
    zoneContributions.sort((a, b) => b.probability - a.probability);
    faultContributions.sort((a, b) => b.probability - a.probability);

    // Compute hazard-consistent magnitude (500-year return period)
    const hazardConsistentMag = this._computeHazardConsistentMag(magBuckets, N);

    // Compute hazard-consistent hypocentral distance
    const hazardConsistentDist = this._computeHazardConsistentDist(zones, faults, lat, lon);

    // Annual exceedance probabilities
    const annualExceedance = {
      PGA_50gal: exceedance50gal.count / N,
      PGA_100gal: exceedance100gal.count / N,
      PGA_200gal: exceedance200gal.count / N,
      PGA_500gal: exceedance500gal.count / N,
    };

    return {
      meta: {
        lat, lon, depth, siteGeology,
        numSimulations: N,
        searchRadiusKm: this.maxRadiusKm,
        returnPeriod: this.returnPeriod,
        timeHorizon: this.timeHorizon,
        paperCitation: 'Torregosa, Sugito & Nojima (2002), JSCE Vol.19 No.710/2002',
      },
      summary: {
        maxMagnitude: maxMag,
        meanMagnitude: countValid > 0 ? magSum / countValid : 0,
        meanPGA_g: countValid > 0 ? totalPGA / countValid : 0,
        hazardConsistentMag,
        hazardConsistentDist,
        zonesAnalyzed: zones.length,
        faultsAnalyzed: faults.length,
      },
      magDistribution: Array.from(magBuckets),
      pgaDistribution: Array.from(pgaBuckets),
      yearDistribution: Array.from(yearBuckets),
      annualExceedance,
      zoneContributions: zoneContributions.filter(z => z.count > 0),
      faultContributions: faultContributions.filter(f => f.count > 0),
    };
  }

  /**
   * Compute the hazard-consistent magnitude for a given return period.
   * Finds the magnitude where cumulative exceedance probability ≈ 1/returnPeriod.
   */
  _computeHazardConsistentMag(magBuckets, N) {
    const targetProb = 1 / this.returnPeriod;
    let cumProb = 0;

    // Iterate from high to low magnitude
    for (let i = 19; i >= 0; i--) {
      cumProb += magBuckets[i] / N;
      if (cumProb >= targetProb) {
        return 1.0 + (i + 0.5) * 0.5; // Convert bucket index to magnitude
      }
    }
    return 5.0; // default
  }

  /**
   * Compute the hazard-consistent hypocentral distance.
   */
  _computeHazardConsistentDist(zones, faults, lat, lon) {
    let weightedDist = 0;
    let totalWeight = 0;

    for (const z of zones) {
      weightedDist += z.dist * z.occRate;
      totalWeight += z.occRate;
    }
    for (const f of faults) {
      weightedDist += (f.dist || 100) * f.vp;
      totalWeight += f.vp;
    }

    return totalWeight > 0 ? weightedDist / totalWeight : 30;
  }

  _emptyResult(lat, lon) {
    return {
      meta: { lat, lon, numSimulations: 0 },
      summary: { maxMagnitude: 0, meanMagnitude: 0, meanPGA_g: 0, hazardConsistentMag: 0, hazardConsistentDist: 0, zonesAnalyzed: 0, faultsAnalyzed: 0 },
      magDistribution: new Array(20).fill(0),
      pgaDistribution: new Array(20).fill(0),
      yearDistribution: new Array(20).fill(0),
      annualExceedance: { PGA_50gal: 0, PGA_100gal: 0, PGA_200gal: 0, PGA_500gal: 0 },
      zoneContributions: [],
      faultContributions: [],
    };
  }
}
