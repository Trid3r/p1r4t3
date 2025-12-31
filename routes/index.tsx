import { define } from "../utils.ts";
import App from "../islands/App.tsx";

export default define.page(function Home(ctx) {
  ctx.state.title = "P1R4T3 - WebGPU Boat";

  return (
    <>
      <App />
    </>
  );
});