import { define } from "../../utils.ts";

export const handler = define.handlers({
  GET() {
    const url = Deno.env.get("TUNNEL_URL");
    return Response.json({ url: url || null });
  },
});