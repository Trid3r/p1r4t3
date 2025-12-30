import { define } from "../utils.ts";
import BoatCanvas from "../islands/BoatCanvas.tsx";

export default define.page(function Home(ctx) {
  ctx.state.title = "P1R4T3 - WebGPU Boat";

  return (
    <>
      <BoatCanvas />
    </>
  );
});