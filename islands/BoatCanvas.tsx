import { useEffect, useRef, useState } from "preact/hooks";

interface TunnelUrlResponse {
  url: string | null;
}

export default function BoatCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gpuReady, setGpuReady] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initWebGPU()
      .then(() => {
        setGpuReady(true);
      })
      .catch(err => {
        console.error("WebGPU initialization failed:", err);
        setError(err.message);
        // Intentar obtener URL del tunel
        return fetch("/api/tunnel");
      })
      .then(res => {
        if (res && res.ok) {
          return res.json();
        }
      })
      .then((data: TunnelUrlResponse) => {
        if (data?.url) {
          setTunnelUrl(data.url);
        }
      })
      .catch(err => {
        console.error("Error:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function initWebGPU() {
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
  }

  // Estado de carga
  if (loading) {
    return (
      <div class="min-h-screen flex items-center justify-center flex-col gap-8 fresh-gradient">
        <div class="bg-white px-8 py-8 rounded-lg shadow-lg text-center max-w-md">
          <h1 class="text-4xl font-bold text-gray-800">⏳ Iniciando WebGPU...</h1>
          <p class="text-gray-600 mt-4">Configurando el motor gráfico...</p>
        </div>
      </div>
    );
  }

  // WebGPU falló pero hay URL del tunel - Mostrar QR
  if (error && tunnelUrl) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      tunnelUrl
    )}`;
    
    return (
      <div class="min-h-screen flex items-center justify-center flex-col gap-8 fresh-gradient">
        <div class="bg-white px-8 py-8 rounded-lg shadow-lg text-center max-w-md flex flex-col gap-4">
          <h1 class="text-4xl font-bold text-gray-800">⚠️ WebGPU No Disponible</h1>
          <p class="text-gray-600">
            Esta app requiere WebGPU que no está disponible en tu navegador actual. 
            Escanea el código QR con tu celular para probar en un navegador compatible.
          </p>
          <div class="my-4">
            <img 
              src={qrUrl} 
              alt="QR Code del Tunnel URL" 
              class="mx-auto rounded-lg shadow-md"
            />
          </div>
          <p class="text-sm text-gray-500 break-all font-mono bg-gray-100 p-2 rounded">
            {tunnelUrl}
          </p>
          <button 
            onClick={() => window.open(tunnelUrl, "_blank")}
            class="px-4 py-2 border-gray-500 border-2 rounded-sm bg-white hover:bg-gray-200 transition-colors font-bold"
          >
            Abrir en Navegador
          </button>
        </div>
      </div>
    );
  }

  // WebGPU falló y no hay tunel
  if (error) {
    return (
      <div class="min-h-screen flex items-center justify-center flex-col gap-8 fresh-gradient">
        <div class="bg-white px-8 py-8 rounded-lg shadow-lg text-center max-w-md">
          <h1 class="text-4xl font-bold text-gray-800">⚠️ WebGPU No Disponible</h1>
          <p class="text-gray-600 mt-4">
            Esta app requiere WebGPU que no está disponible en tu navegador actual.
          </p>
          <p class="text-sm text-red-500 mt-4 font-mono bg-red-50 p-2 rounded">
            {error}
          </p>
        </div>
      </div>
    );
  }

  // WebGPU listo, mostrar canvas
  return (
    <div class="min-h-screen">
      {/* Agregare el canvas del un banco navegando */}
      <canvas 
        ref={canvasRef} 
        id="boat-canvas" 
        class="w-full h-screen"
      />
    </div>
  );
}