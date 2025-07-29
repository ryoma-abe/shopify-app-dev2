import { json, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getQRCode, validateQRCode } from "../models/QRCode.server";
import {
  Navigate,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import { useState } from "react";
import QRCodeForm from "../components/QRCodeForm";

// ローダー関数
export async function loader({ request, params }) {
  const { admin } = await authenticate.admin(request);

  if (params.id === "new") {
    return json({
      destination: "product",
      title: "",
    });
  }

  return json(await getQRCode(Number(params.id), admin.graphql));
}

// 送信されたときのアクション
export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  /** @type {any} */
  const data = {
    ...Object.fromEntries(await request.formData()),
    shop,
    expiresAt,
  };

  if (data.action === "delete") {
    // 関連するScanLogを先に削除
    await db.scanLog.deleteMany({ where: { qrcodeId: Number(params.id) } });
    // その後QRCodeを削除
    await db.qRCode.delete({ where: { id: Number(params.id) } });
    return redirect("/app");
  }

  const errors = validateQRCode(data);

  if (errors) {
    return json({ errors }, { status: 422 });
  }

  const qrCode =
    params.id === "new"
      ? await db.qRCode.create({ data })
      : await db.qRCode.update({ where: { id: Number(params.id) }, data });

  return redirect(`/app/qrcodes/${qrCode.id}`);
}

export default function QRCodePage() {
  // ------------フォームの状態管理------------
  const errors = useActionData()?.errors || {};

  const qrCode = useLoaderData();
  const [formState, setFormState] = useState(qrCode);
  const [cleanFormState, setCleanFormState] = useState(qrCode);
  const isDirty = JSON.stringify(formState) !== JSON.stringify(cleanFormState);

  const nav = useNavigation();
  const isSaving =
    nav.state === "submitting" && nav.formData?.get("action") !== "delete";
  const isDeleting = nav.state === "submitting" && nav.formData?.get("action");

  // ------------製品セレクター------------
  async function selectProduct() {
    const products = await window.shopify.resourcePicker({
      type: "product",
      action: "select",
    });

    if (products) {
      const { images, id, variants, title, handle } = products[0];

      setFormState({
        ...formState,
        productId: id,
        productVariantId: variants[0].id,
        productTitle: title,
        productHandle: handle,
        productAlt: images[0]?.altText,
        productImage: images[0]?.originalSrc,
      });
    }
  }
  // -----------送信ボタンを押したときの処理------------

  const submit = useSubmit();
  function handleSave() {
    const data = {
      title: formState.title,
      productId: formState.productId || "",
      productVariantId: formState.productVariantId || "",
      productHandle: formState.productHandle || "",
      destination: formState.destination,
    };

    setCleanFormState({ ...formState });
    submit(data, { method: "post" });
  }
  return (
    <QRCodeForm
      qrCode={qrCode}
      Navigate={Navigate}
      formState={formState}
      setFormState={setFormState}
      errors={errors}
      selectProduct={selectProduct}
      isDeleting={isDeleting}
      isSaving={isSaving}
      submit={submit}
      isDirty={isDirty}
      handleSave={handleSave}
    />
  );
}
