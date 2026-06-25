import { NextResponse } from "next/server";
import { DEFAULT_PERSONA_CATALOG } from "@/lib/personaCatalog";
import { PERSONA_EVOLUTION_STAGES } from "@/lib/personaEvolution";
import {
  getPersonaBaseImageSrc,
  getPersonaEvolutionImageSrc,
  getPersonaImageApiSrc,
} from "@/lib/personaImages";

export function GET() {
  const stages = PERSONA_EVOLUTION_STAGES.map((stage) => stage.key);
  const personas = DEFAULT_PERSONA_CATALOG.map((persona) => {
    const evolutionImages = Object.fromEntries(
      PERSONA_EVOLUTION_STAGES.map((stage) => [
        stage.key,
        getPersonaEvolutionImageSrc(persona.key, stage.key),
      ])
    );
    const baseImage = getPersonaBaseImageSrc(persona.key);

    return {
      key: persona.key,
      displayName: persona.displayName,
      baseImage,
      apiImage: getPersonaImageApiSrc(persona.key),
      evolutionImages,
    };
  });

  return NextResponse.json({
    ok: true,
    mode: "static-url-convention",
    convention: "/persona-images/{persona_key}_{stage}.png",
    baseConvention: "/persona-images/{persona_key}.png",
    stages,
    total: personas.length,
    personas,
    // Compatibility for older local diagnostic scripts. This endpoint no longer
    // asserts file presence because serverless functions must not inspect the
    // public image directory.
    static_count: null,
    fallback_count: null,
    coverage_pct: null,
    items: personas.map((persona) => ({
      key: persona.key,
      title: persona.displayName,
      displayName: persona.displayName,
      has_static_image: null,
      static_image: persona.baseImage,
      api_image: persona.apiImage,
      evolution_images: persona.evolutionImages,
      db_image_url: null,
      db_icon: null,
    })),
  });
}
