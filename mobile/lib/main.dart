import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';
import 'package:permission_handler/permission_handler.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const CISVApp());
}

class CISVApp extends StatelessWidget {
  const CISVApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CISV — Seismic Monitoring',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF020408),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00D4FF),
          secondary: Color(0xFF00FF88),
          surface: Color(0xFF060C18),
        ),
        fontFamily: 'monospace',
      ),
      home: const CISVHome(),
    );
  }
}

class CISVHome extends StatefulWidget {
  const CISVHome({super.key});

  @override
  State<CISVHome> createState() => _CISVHomeState();
}

class _CISVHomeState extends State<CISVHome> {
  late final WebViewController _controller;
  bool _isLoading = true;
  String _status = 'Loading...';

  // Production URL — change to your deployed server
  static const String _baseUrl = 'http://10.0.2.2:3000'; // Android emulator
  // static const String _baseUrl = 'http://localhost:3000'; // iOS simulator

  @override
  void initState() {
    super.initState();
    _initWebView();
  }

  void _initWebView() {
    final PlatformWebViewControllerCreationParams params =
        PlatformWebViewControllerCreationParams();
    final controller = WebViewController.fromPlatformCreationParams(params);

    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF020408))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            setState(() {
              _isLoading = true;
              _status = 'Loading...';
            });
          },
          onPageFinished: (url) {
            setState(() {
              _isLoading = false;
              _status = 'Ready';
            });
          },
          onWebResourceError: (error) {
            setState(() {
              _status = 'Error: ${error.description}';
            });
          },
        ),
      )
      ..loadRequest(Uri.parse(_baseUrl));

    _controller = controller;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020408),
      body: Stack(
        children: [
          // WebView
          WebViewWidget(controller: _controller),

          // Loading indicator
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(
                color: Color(0xFF00D4FF),
                strokeWidth: 2,
              ),
            ),

          // Status bar overlay
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xCC020408), Color(0x00020408)],
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'CISV',
                      style: TextStyle(
                        color: Color(0xFF00D4FF),
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2,
                      ),
                    ),
                    Text(
                      _status,
                      style: TextStyle(
                        color: _status == 'Ready'
                            ? const Color(0xFF00FF88)
                            : const Color(0xFF5A9AB5),
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
