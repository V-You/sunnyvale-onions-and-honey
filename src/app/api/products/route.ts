import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/catalog";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv } from "@/lib/kv";

export const runtime = "edge";

const PRODUCT_FEED_METHODS = ["GET", "OPTIONS"] as const;

export async function GET(request: Request) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const products = getAllProducts();
  return corsJson(origin, env, { products }, undefined, PRODUCT_FEED_METHODS);
}

export async function OPTIONS(request: Request) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    PRODUCT_FEED_METHODS,
  );
}
