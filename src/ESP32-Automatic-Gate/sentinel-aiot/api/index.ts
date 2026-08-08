import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: "online",
    message: "Sentinel AIoT Gate Controller API is active on Vercel"
  });
}
