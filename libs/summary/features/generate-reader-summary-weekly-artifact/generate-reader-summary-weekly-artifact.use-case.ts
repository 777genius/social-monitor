import { ReaderSummaryWeeklyArtifact } from "../../domain/entities/reader-summary-weekly-artifact";
import { assertReaderSummaryWeeklyModelStoryObservationsUnique } from "../../domain/policies/reader-summary-story-identity-policy";
import {
  sealReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelPort,
} from "../../ports/reader-summary-weekly-model.port";
import type { GenerateReaderSummaryWeeklyArtifactCommand } from "./generate-reader-summary-weekly-artifact.command";

export class GenerateReaderSummaryWeeklyArtifactUseCase {
  constructor(
    private readonly weeklyModel: ReaderSummaryWeeklyModelPort,
  ) {}

  async execute(
    command: GenerateReaderSummaryWeeklyArtifactCommand,
  ): Promise<ReaderSummaryWeeklyArtifact> {
    const input = sealReaderSummaryWeeklyModelInput(command);
    assertReaderSummaryWeeklyModelStoryObservationsUnique(input);
    const output = await this.weeklyModel.generate(input);

    return ReaderSummaryWeeklyArtifact.create({ input, output });
  }
}
