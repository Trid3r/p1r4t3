import { useEffect, useState, useCallback, useMemo } from "preact/hooks";
import Canvas from "./Canvas.tsx";

interface TunnelUrlResponse {
  url: string | null;
}

export type Theme = "dark" | "light";

export default function App() {
  const [device, setDevice] = useState<GPUDevice | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");

  // --- Logic: Theme Management ---
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // --- Logic: WebGPU Initialization & Tunneling ---
  const initWebGPU = useCallback(async () => {
    if (!navigator.gpu) {
      throw new Error("WebGPU no está soportado en este navegador");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No se encontró un adaptador GPU");
    }

    const gpuDevice = await adapter.requestDevice();
    if (!gpuDevice) {
      throw new Error("No se pudo obtener el dispositivo GPU");
    }

    console.log("WebGPU inicializado correctamente");
    return gpuDevice;
  }, []);

  useEffect(() => {
    let isMounted = true;

    initWebGPU()
      .then((gpuDevice) => {
        if (isMounted) {
          setDevice(gpuDevice);
        }
      })
      .catch((err) => {
        console.error("WebGPU initialization failed:", err);
        if (isMounted) {
          setError(err.message);
        }
        // Fallback: Fetch tunnel if WebGPU fails
        return fetch("/api/tunnel");
      })
      .then((res) => {
        if (res && res.ok) return res.json();
      })
      .then((data: TunnelUrlResponse) => {
        if (isMounted && data?.url) {
          setTunnelUrl(data.url);
        }
      })
      .catch((err) => console.error("Error fetching tunnel:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initWebGPU]);

  // --- Logic: UI Classes & Render Helpers ---
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
    gradient: theme === "dark"
      ? "dark-gradient"
      : "light-gradient",
    iconColor: theme === "dark" ? "text-white" : "text-black",
  }), [theme]);

  const ThemeToggle = () => (
    <button
      onClick={toggleTheme}
      class={`fixed top-4 right-4 px-3 py-2 rounded-md border-2 transition-all duration-200 z-50 ${themeClasses.button} ${themeClasses.iconColor}`}
      aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );

  // --- Render States ---

  // 1. Loading
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

  // 2. Error + Tunnel (WebGPU not supported)
  if (error && tunnelUrl) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tunnelUrl)}`;
    return (
      <div className={`min-h-screen flex items-center justify-center flex-col gap-8 ${themeClasses.gradient}`}>
        <ThemeToggle />
        <div className={`px-8 py-8 rounded-lg shadow-lg text-center max-w-md flex flex-col gap-4 transition-all duration-300 ${themeClasses.card} border`}>
          <p className={theme === "dark" ? "text-gray-300" : "text-gray-600"}>
            Navegador no compatible, escanea para probar en un navegador compatible.
          </p>
          <div className={`my-4 ${themeClasses.qrContainer} p-4 rounded-lg`}>
            <img src={qrUrl} alt="QR Code" className="mx-auto rounded-lg shadow-md" />
          </div>
        </div>
      </div>
    );
  }

  // 3. Error Only
  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center flex-col gap-8 ${themeClasses.gradient}`}>
        <ThemeToggle />
        <div className={`px-8 py-8 rounded-lg shadow-lg text-center max-w-md transition-all duration-300 ${themeClasses.card} border`}>
          <h1 className="text-4xl font-bold">⚠️ WebGPU No Disponible</h1>
          <p className={`mt-4 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  // 4. Success -> Render BoatCanvas
  return (
    <div className={`min-h-screen ${themeClasses.container} transition-colors duration-300`}>
      <ThemeToggle />
      {device && <Canvas device={device} theme={theme} />}
    </div>
  );
}