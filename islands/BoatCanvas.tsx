import { useEffect, useRef, useState } from "preact/hooks";
import { mat4 } from "gl-matrix";

// 1. Simple Shader: Transforms vertices and passes color directly to fragment
const SHADER_CODE = `
struct Uniforms {
  mvp : mat4x4<f32>,
};

@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexInput {
  @location(0) position : vec4<f32>,
  @location(1) color : vec4<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) Color : vec4<f32>,
};

@vertex
fn vs_main(input : VertexInput) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.mvp * input.position;
  output.Color = input.color;
  return output;
}

@fragment
fn fs_main(@location(0) Color : vec4<f32>) -> @location(0) vec4<f32> {
  return Color;
}
`;

export default function BoatCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Initializing WebGPU...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 2. Feature Check
    if (!navigator.gpu) {
      setError("WebGPU is not supported in this browser.");
      return;
    }

    let canceled = false;
    let animationId: number;

    const init = async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No GPU adapter found.");
        
        const device = await adapter.requestDevice();
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("webgpu") as GPUCanvasContext;
        const format = navigator.gpu.getPreferredCanvasFormat();

        context.configure({
          device,
          format,
          alphaMode: "premultiplied",
        });

        // 3. Geometry: A simple Cube (Position xyz, Color rgb)
        // prettier-ignore
        const vertices = new Float32Array([
          // Front face (Red)
          -0.5, -0.5,  0.5,   1, 0, 0,
           0.5, -0.5,  0.5,   1, 0, 0,
           0.5,  0.5,  0.5,   1, 0, 0,
          -0.5, -0.5,  0.5,   1, 0, 0,
           0.5,  0.5,  0.5,   1, 0, 0,
          -0.5,  0.5,  0.5,   1, 0, 0,

          // Back face (Green)
          -0.5, -0.5, -0.5,   0, 1, 0,
          -0.5,  0.5, -0.5,   0, 1, 0,
           0.5,  0.5, -0.5,   0, 1, 0,
          -0.5, -0.5, -0.5,   0, 1, 0,
           0.5,  0.5, -0.5,   0, 1, 0,
           0.5, -0.5, -0.5,   0, 1, 0,

          // Top face (Blue)
          -0.5,  0.5, -0.5,   0, 0, 1,
          -0.5,  0.5,  0.5,   0, 0, 1,
           0.5,  0.5,  0.5,   0, 0, 1,
          -0.5,  0.5, -0.5,   0, 0, 1,
           0.5,  0.5,  0.5,   0, 0, 1,
           0.5,  0.5, -0.5,   0, 0, 1,

          // Bottom face (Yellow)
          -0.5, -0.5, -0.5,   1, 1, 0,
           0.5, -0.5, -0.5,   1, 1, 0,
           0.5, -0.5,  0.5,   1, 1, 0,
          -0.5, -0.5, -0.5,   1, 1, 0,
           0.5, -0.5,  0.5,   1, 1, 0,
          -0.5, -0.5,  0.5,   1, 1, 0,

          // Right face (Magenta)
           0.5, -0.5, -0.5,   1, 0, 1,
           0.5,  0.5, -0.5,   1, 0, 1,
           0.5,  0.5,  0.5,   1, 0, 1,
           0.5, -0.5, -0.5,   1, 0, 1,
           0.5,  0.5,  0.5,   1, 0, 1,
           0.5, -0.5,  0.5,   1, 0, 1,

          // Left face (Cyan)
          -0.5, -0.5, -0.5,   0, 1, 1,
          -0.5, -0.5,  0.5,   0, 1, 1,
          -0.5,  0.5,  0.5,   0, 1, 1,
          -0.5, -0.5, -0.5,   0, 1, 1,
          -0.5,  0.5,  0.5,   0, 1, 1,
          -0.5,  0.5, -0.5,   0, 1, 1,
        ]);

        const vertexBuffer = device.createBuffer({
          size: vertices.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(vertexBuffer, 0, vertices);

        // 4. Pipeline Setup
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: {
            module: device.createShaderModule({ code: SHADER_CODE }),
            entryPoint: "vs_main",
            buffers: [{
              arrayStride: 24, // 6 floats (3 pos + 3 col) * 4 bytes
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x3" }, // Position
                { shaderLocation: 1, offset: 12, format: "float32x3" }, // Color
              ],
            }],
          },
          fragment: {
            module: device.createShaderModule({ code: SHADER_CODE }),
            entryPoint: "fs_main",
            targets: [{ format }],
          },
          primitive: {
            topology: "triangle-list",
            cullMode: "back", // Efficiently only draw front-facing triangles
          },
          depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus",
          },
        });

        const uniformBuffer = device.createBuffer({
          size: 64, // 4x4 Matrix
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        // Depth Texture handling
        let depthTexture: GPUTexture;
        const resizeDepth = () => {
           if (depthTexture) depthTexture.destroy();
           depthTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          });
        };
        // Initial sizing
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        resizeDepth();

        setStatus("Running");

        // 5. Animation Loop
        const projectionMatrix = mat4.create();
        const viewMatrix = mat4.create();
        const modelMatrix = mat4.create();
        const mvpMatrix = mat4.create();
        let rotation = 0;

        const frame = () => {
          if (canceled) return;

          // Resize handling
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            resizeDepth();
          }

          rotation += 0.02;

          // Math: Projection * View * Model
          mat4.perspective(projectionMatrix, (45 * Math.PI) / 180, canvas.width / canvas.height, 0.1, 100.0);
          mat4.lookAt(viewMatrix, [3, 3, 3], [0, 0, 0], [0, 1, 0]); // Camera at (3,3,3) looking at (0,0,0)
          
          mat4.identity(modelMatrix);
          mat4.rotateY(modelMatrix, modelMatrix, rotation); // Rotate around Y
          mat4.rotateX(modelMatrix, modelMatrix, rotation * 0.5); // Rotate around X slightly

          mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);
          mat4.multiply(mvpMatrix, mvpMatrix, modelMatrix);

          device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as Float32Array);

          const commandEncoder = device.createCommandEncoder();
          const textureView = context.getCurrentTexture().createView();

          const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
              view: textureView,
              clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }, // Dark gray background
              loadOp: "clear",
              storeOp: "store",
            }],
            depthStencilAttachment: {
              view: depthTexture.createView(),
              depthClearValue: 1.0,
              depthLoadOp: "clear",
              depthStoreOp: "store",
            },
          });

          renderPass.setPipeline(pipeline);
          renderPass.setBindGroup(0, bindGroup);
          renderPass.setVertexBuffer(0, vertexBuffer);
          renderPass.draw(36); // 6 faces * 2 triangles * 3 vertices
          renderPass.end();

          device.queue.submit([commandEncoder.finish()]);
          animationId = requestAnimationFrame(frame);
        };

        animationId = requestAnimationFrame(frame);

      } catch (err: any) {
        console.error(err);
        setError(err.message);
      }
    };

    init();

    return () => {
      canceled = true;
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div class="relative w-full h-screen bg-black flex items-center justify-center">
      {error ? (
        <div class="text-red-500 font-bold p-4 border border-red-500 rounded bg-red-900/20">
          Error: {error}
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} class="w-full h-full block absolute top-0 left-0" />
          <div class="absolute top-4 left-4 text-white font-mono text-sm bg-black/50 p-2 pointer-events-none">
            Status: {status}
          </div>
        </>
      )}
    </div>
  );
}