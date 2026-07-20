using System;
using System.Collections.Generic;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.VerseProcessing.Models;

namespace BibleNote.Services.VerseProcessing
{
    public static class VerseRelationsCalculator
    {
        public static VerseRelationCalculationResult Calculate(DocumentParseResult documentResult, int? maxRelations = null)
        {
            var result = new VerseRelationCalculationResult();
            if (documentResult?.RootHierarchyResult == null)
                return result;

            var linearResult = LinearParseResult.FromHierarchyParseResult(documentResult.RootHierarchyResult);
            var paragraphs = new List<ParagraphParseResultExt>(linearResult.Paragraphs);
            var referencedParagraphIndexes = GetReferencedParagraphIndexes(paragraphs);
            var nextLowerParagraphIndexes = GetNextLowerParagraphIndexes(paragraphs);

            // Preserve the strongest local evidence across the whole document before
            // lower-priority cross-paragraph combinations can exhaust maxRelations.
            foreach (var paragraphIndex in referencedParagraphIndexes)
            {
                var paragraph = paragraphs[paragraphIndex].ParagraphResult;
                for (var referenceIndex = 0; referenceIndex < paragraph.VerseEntries.Count; referenceIndex++)
                {
                    var source = paragraph.VerseEntries[referenceIndex];

                    for (var relativeReferenceIndex = referenceIndex + 1;
                        relativeReferenceIndex < paragraph.VerseEntries.Count;
                        relativeReferenceIndex++)
                    {
                        var target = paragraph.VerseEntries[relativeReferenceIndex];
                        if (!AddRelations(
                            result,
                            source,
                            target,
                            paragraph,
                            paragraph,
                            referenceIndex,
                            relativeReferenceIndex,
                            GetWithinParagraphRelationWeight(source, target),
                            maxRelations))
                            return result;
                    }
                }
            }

            for (var sourceParagraphListIndex = 0;
                sourceParagraphListIndex < referencedParagraphIndexes.Count;
                sourceParagraphListIndex++)
            {
                var paragraphIndex = referencedParagraphIndexes[sourceParagraphListIndex];
                var paragraph = paragraphs[paragraphIndex].ParagraphResult;
                for (var referenceIndex = 0; referenceIndex < paragraph.VerseEntries.Count; referenceIndex++)
                {
                    var source = paragraph.VerseEntries[referenceIndex];

                    for (var relativeParagraphListIndex = sourceParagraphListIndex + 1;
                        relativeParagraphListIndex < referencedParagraphIndexes.Count;
                        relativeParagraphListIndex++)
                    {
                        var relativeParagraphIndex = referencedParagraphIndexes[relativeParagraphListIndex];
                        var relativeParagraph = paragraphs[relativeParagraphIndex].ParagraphResult;
                        var relationWeight = GetParagraphsWeight(
                            paragraphIndex,
                            relativeParagraphIndex,
                            nextLowerParagraphIndexes);
                        for (var relativeReferenceIndex = 0;
                            relativeReferenceIndex < relativeParagraph.VerseEntries.Count;
                            relativeReferenceIndex++)
                        {
                            if (!AddRelations(
                                result,
                                source,
                                relativeParagraph.VerseEntries[relativeReferenceIndex],
                                paragraph,
                                relativeParagraph,
                                referenceIndex,
                                relativeReferenceIndex,
                                relationWeight,
                                maxRelations))
                                return result;
                        }
                    }
                }
            }

            return result;
        }

        private static List<int> GetReferencedParagraphIndexes(IReadOnlyList<ParagraphParseResultExt> paragraphs)
        {
            var result = new List<int>();
            for (var index = 0; index < paragraphs.Count; index++)
            {
                if (paragraphs[index].ParagraphResult.VerseEntries.Count > 0)
                    result.Add(index);
            }

            return result;
        }

        private static int[] GetNextLowerParagraphIndexes(IReadOnlyList<ParagraphParseResultExt> paragraphs)
        {
            var result = new int[paragraphs.Count];
            var candidates = new Stack<int>();

            for (var index = paragraphs.Count - 1; index >= 0; index--)
            {
                while (candidates.Count > 0 && paragraphs[candidates.Peek()].Depth >= paragraphs[index].Depth)
                    candidates.Pop();

                result[index] = candidates.Count > 0 ? candidates.Peek() : paragraphs.Count;
                candidates.Push(index);
            }

            return result;
        }

        private static bool AddRelations(
            VerseRelationCalculationResult result,
            VerseEntry source,
            VerseEntry target,
            ParagraphParseResult paragraph,
            ParagraphParseResult relativeParagraph,
            int referenceIndex,
            int relativeReferenceIndex,
            decimal relationWeight,
            int? maxRelations)
        {
            foreach (var verse in source.VersePointer.SubVerses.Verses)
            {
                foreach (var relativeVerse in target.VersePointer.SubVerses.Verses)
                {
                    if (maxRelations.HasValue && result.Relations.Count >= maxRelations.Value)
                    {
                        result.Capped = true;
                        return false;
                    }

                    result.Relations.Add(new CalculatedVerseRelation
                    {
                        VerseId = verse.GetVerseId(),
                        RelativeVerseId = relativeVerse.GetVerseId(),
                        Paragraph = paragraph,
                        RelativeParagraph = relativeParagraph,
                        ReferenceIndex = referenceIndex,
                        RelativeReferenceIndex = relativeReferenceIndex,
                        RelationWeight = Math.Round(relationWeight, 4)
                    });
                }
            }

            return true;
        }

        private static decimal GetParagraphsWeight(
            int paragraphIndex,
            int relativeParagraphIndex,
            IReadOnlyList<int> nextLowerParagraphIndexes)
        {
            const decimal minWeight = 0.01M;
            if (nextLowerParagraphIndexes[paragraphIndex] <= relativeParagraphIndex)
                return minWeight;

            var intermediateParagraphs = relativeParagraphIndex - paragraphIndex - 1;
            if (intermediateParagraphs >= 6)
                return minWeight;

            return 0.5M / (1 << intermediateParagraphs);
        }

        private static decimal GetWithinParagraphRelationWeight(VerseEntry source, VerseEntry target)
        {
            var distance = target.StartIndex - source.EndIndex;
            if (distance < 5)
                return 1;
            if (distance < 50)
                return 0.8M;
            return 40M / distance;
        }
    }
}
