import "reflect-metadata";
import { Controller, Get } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ApiOkResponse, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { ReaderSummaryWeeklyProjectionResponseDto } from "./reader-summary-weekly-projection.dto";

@Controller("weekly-schema-fixture")
class WeeklySchemaFixtureController {
  @Get()
  @ApiOkResponse({ type: ReaderSummaryWeeklyProjectionResponseDto })
  read(): void {}
}

describe("weekly artifact OpenAPI generator compatibility", () => {
  it("keeps artifact required, typed and explicitly nullable without a single-ref allOf", async () => {
    const module = await Test.createTestingModule({
      controllers: [WeeklySchemaFixtureController],
    }).compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("Weekly schema fixture").setVersion("1").build(),
      );
      const schemas = document.components!.schemas!;
      const response = schemas.ReaderSummaryWeeklyProjectionResponseDto!;
      if ("$ref" in response) throw new Error("Expected response schema");

      expect(response.required).toContain("artifact");
      expect(response.properties!.artifact).toEqual({
        nullable: true,
        oneOf: [
          { $ref: "#/components/schemas/ReaderSummaryWeeklyProjectionArtifactDto" },
          { type: "object", nullable: true, enum: [null] },
        ],
      });
      // The null branch must not accept arbitrary objects, and the real
      // artifact (including its nested DTOs) must still be registered.
      const artifact = schemas.ReaderSummaryWeeklyProjectionArtifactDto!;
      if ("$ref" in artifact) throw new Error("Expected artifact schema");
      expect(artifact.required).toContain("artifactId");
      expect(artifact.nullable).toBeUndefined();
      for (const name of ["Story", "Section", "Citation"]) {
        expect(schemas[`ReaderSummaryWeeklyProjection${name}Dto`]).toBeDefined();
      }
    } finally {
      await app.close();
    }
  });
});
