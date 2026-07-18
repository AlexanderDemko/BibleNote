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
            var paragraphNode = linearResult.Paragraphs.First;
            while (paragraphNode != null)
            {
                var paragraph = paragraphNode.Value.ParagraphResult;
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

                    var relativeParagraphNode = paragraphNode.Next;
                    while (relativeParagraphNode != null)
                    {
                        var relativeParagraph = relativeParagraphNode.Value.ParagraphResult;
                        var relationWeight = GetParagraphsWeight(paragraphNode, relativeParagraphNode);
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

                        relativeParagraphNode = relativeParagraphNode.Next;
                    }
                }

                paragraphNode = paragraphNode.Next;
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
            LinkedListNode<ParagraphParseResultExt> node,
            LinkedListNode<ParagraphParseResultExt> relationNode)
        {
            const decimal minWeight = 0.01M;
            if (relationNode.Value.Depth < node.Value.Depth)
                return minWeight;

            var result = 0.5M;
            var nextNode = node.Next;
            while (nextNode != relationNode && result > minWeight)
            {
                if (nextNode.Value.Depth >= node.Value.Depth)
                    result /= 2;
                else
                {
                    result = minWeight;
                    break;
                }

                nextNode = nextNode.Next;
            }

            return Math.Max(result, minWeight);
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
