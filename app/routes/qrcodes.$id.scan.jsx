import { redirect } from "@remix-run/node";
import invariant from "tiny-invariant";
import db from "../db.server";

import { getDestinationUrl } from "../models/QRCode.server";

export const loader = async ({ params, request }) => {
  invariant(params.id, "Could not find QR code destination");

  const id = Number(params.id);
  const qrCode = await db.qRCode.findFirst({ where: { id } });

  invariant(qrCode, "Could not find QR code destination");

  await db.qRCode.update({
    where: { id },
    data: { scans: { increment: 1 } },
  });

  const userAgent = request.headers.get("user-agent") || "unknown";
  const ipAddress =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  await db.scanLog.create({
    data: {
      qrcodeId: id,
      userAgent: userAgent.replace(/[^\x00-\x7F]/g, "?"),
      ipAddress: ipAddress.replace(/[^\x00-\x7F]/g, "?"),
    },
  });

  const destinationUrl = getDestinationUrl(qrCode);
  return redirect(encodeURI(destinationUrl));
};
