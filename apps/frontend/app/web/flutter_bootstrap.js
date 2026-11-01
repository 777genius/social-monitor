{{flutter_js}}
{{flutter_build_config}}

(function () {
  const configuredRelease = '{{SOCIAL_MONITOR_RELEASE_ID}}';
  const builds = _flutter.buildConfig.builds;
  const validRelease = /^[a-f0-9]{40}$/.test(configuredRelease);
  const development = builds.length > 0 &&
    builds.every((build) => build.compileTarget === 'dartdevc');
  if (!validRelease && !development) {
    throw new Error('Frontend release identity is missing or invalid');
  }
  const release = validRelease ? configuredRelease : 'development-' + Date.now();

  // These files are one compiler output. A shared URL version prevents a new
  // loader from linking an older, still-fresh browser-cached Wasm module.
  for (const build of builds) {
    for (const field of ['mainWasmPath', 'jsSupportRuntimePath', 'mainJsPath']) {
      if (typeof build[field] !== 'string') continue;
      const url = new URL(build[field], document.baseURI);
      url.searchParams.set('v', release);
      build[field] = url.href;
    }
  }

  const wasm = builds.find((build) => build.compileTarget === 'dart2wasm');
  if (wasm) {
    const module = document.createElement('link');
    module.rel = 'modulepreload';
    module.href = wasm.jsSupportRuntimePath;
    document.head.appendChild(module);
    const binary = document.createElement('link');
    binary.rel = 'preload';
    binary.as = 'fetch';
    binary.type = 'application/wasm';
    binary.crossOrigin = 'use-credentials';
    binary.href = wasm.mainWasmPath;
    document.head.appendChild(binary);
  }
  _flutter.loader.load();
}());
