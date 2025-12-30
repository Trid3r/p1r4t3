import { useEffect, useRef, useState, useCallback, useMemo } from "preact/hooks";

interface TunnelUrlResponse {
  url: string | null;
}

type Theme = "dark" | "light";

export default function BoatCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gpuReady, setGpuReady] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");

  // Load saved theme preference
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  // Save theme preference and trigger canvas update
  useEffect(() => {
    localStorage.setItem("theme", theme);
    // Trigger WebGPU re-render if initialized
    if (gpuReady && canvasRef.current) {
      // @ts-ignore - Custom event for WebGPU redraw
      canvasRef.current.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
    }
  }, [theme, gpuReady]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  }, []);

  const initWebGPU = useCallback(async () => {
    if (!navigator.gpu) {
      throw new Error("WebGPU no está soportado en este navegador");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No se encontró un adaptador GPU");
    }

    const device = await adapter.requestDevice();
    if (!device) {
      throw new Error("No se pudo obtener el dispositivo GPU");
    }

    console.log("WebGPU inicializado correctamente");
    return { device, adapter };
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    initWebGPU()
      .then(() => {
        if (isMounted) {
          setGpuReady(true);
        }
      })
      .catch(err => {
        console.error("WebGPU initialization failed:", err);
        if (isMounted) {
          setError(err.message);
        }
        return fetch("/api/tunnel");
      })
      .then(res => {
        if (res && res.ok) {
          return res.json();
        }
      })
      .then((data: TunnelUrlResponse) => {
        if (isMounted && data?.url) {
          setTunnelUrl(data.url);
        }
      })
      .catch(err => {
        console.error("Error:", err);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initWebGPU]);

  // Memoized theme classes for performance
  const themeClasses = useMemo(() => ({
    container: theme === "dark" 
      ? "bg-gray-900 text-gray-100" 
      : "bg-white text-gray-800",
    card: theme === "dark"
      ? "bg-gray-800 border-gray-700"
      : "bg-white border-gray-200",
    error: theme === "dark"
      ? "text-red-400 bg-red-900/20 border-red-800"
      : "text-red-500 bg-red-50 border-red-200",
    button: theme === "dark"
      ? "bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-600"
      : "bg-white hover:bg-gray-200 text-gray-800 border-gray-500",
    qrContainer: theme === "dark"
      ? "bg-gray-800"
      : "bg-gray-100",
    tunnelUrl: theme === "dark"
      ? "text-gray-400 bg-gray-700"
      : "text-gray-500 bg-gray-100",
    gradient: theme === "dark"
      ? "dark-gradient"
      : "light-gradient"
  }), [theme]);

  // Theme toggle button component
  const ThemeToggle = useCallback(() => (
    <button
      onClick={toggleTheme}
      class={`fixed top-4 right-4 px-3 py-2 rounded-md border-2 transition-all duration-200 z-50 ${themeClasses.button}`}
      aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  ), [toggleTheme, theme, themeClasses.button]);

  // State: Loading
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center flex-col gap-8 ${themeClasses.gradient}`}>
        <ThemeToggle />
        <div className={`px-8 py-8 rounded-lg shadow-lg text-center max-w-md transition-all duration-300 ${themeClasses.card} border`}>
          <h1 className="text-4xl font-bold">⏳ Starting WebGPU...</h1>
        </div>
      </div>
    );
  }

  // State: WebGPU failed but tunnel available
  if (error && tunnelUrl) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      tunnelUrl
    )}`;
    
    return (
      <div className={`min-h-screen flex items-center justify-center flex-col gap-8 ${themeClasses.gradient}`}>
        <ThemeToggle />
        <div className={`px-8 py-8 rounded-lg shadow-lg text-center max-w-md flex flex-col gap-4 transition-all duration-300 ${themeClasses.card} border`}>
          <p className={theme === "dark" ? "text-gray-300" : "text-gray-600"}>
            Navegador no compatible, escanea para probar en un navegador compatible.
          </p>
          <div className={`my-4 ${themeClasses.qrContainer} p-4 rounded-lg`}>
            <img 
              src={qrUrl} 
              alt="QR Code del Tunnel URL" 
              className="mx-auto rounded-lg shadow-md"
            />
          </div>
        </div>
      </div>
    );
  }

  // State: WebGPU failed and no tunnel
  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center flex-col gap-8 ${themeClasses.gradient}`}>
        <ThemeToggle />
        <div className={`px-8 py-8 rounded-lg shadow-lg text-center max-w-md transition-all duration-300 ${themeClasses.card} border`}>
          <h1 className="text-4xl font-bold">⚠️ WebGPU No Disponible</h1>
          <p className={`mt-4 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
            Esta app requiere WebGPU que no está disponible en tu navegador actual.
          </p>
          <p className={`mt-4 font-mono p-2 rounded border ${themeClasses.error}`}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  // State: WebGPU ready
  return (
    <div className={`min-h-screen ${themeClasses.container} transition-colors duration-300`}>
      <ThemeToggle />
      <canvas 
        ref={canvasRef} 
        id="boat-canvas" 
        className="w-full h-screen"
        data-theme={theme} // Pass theme to canvas for WebGPU shaders
      />
    </div>
  );
}