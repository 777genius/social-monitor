import { ReaderSummaryWeeklyArtifact } from "../../domain/entities/reader-summary-weekly-artifact";
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
    const output = await this.weeklyModel.generate(input);

    return ReaderSummaryWeeklyArtifact.create({ input, output });
  }
}
