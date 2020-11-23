using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.VerseProcessing.Contracts;
using BibleNote.Services.VerseProcessing.Models;

namespace BibleNote.Services.VerseProcessing
{
    class SaveVerseRelationsProcessing : IDocumentParseResultProcessing
    {
        public int Order => 1;

        readonly ITrackingDbContext analyticsContext;

        public SaveVerseRelationsProcessing(ITrackingDbContext analyticsContext)
        {
            this.analyticsContext = analyticsContext;
        }

        public async Task ProcessAsync(int documentId, DocumentParseResult documentResult, CancellationToken cancellationToken = default)
        {
            var linearResult = LinearParseResult.FromHierarchyParseResult(documentResult.RootHierarchyResult);
            var verseRelations = ProcessLinearResult(linearResult);
            await this.analyticsContext.DoInTransactionAsync(async (token) =>
            {
                this.analyticsContext.VerseRelationRepository.AddRange(verseRelations);
                await this.analyticsContext.SaveChangesAsync(token);
                return true;
            }, cancellationToken);
        }

        private IEnumerable<VerseRelation> ProcessLinearResult(LinearParseResult linearResult)
        {
            var verseRelations = new List<VerseRelation>();

            foreach (var paragraph in linearResult.Paragraphs)
            {
                var paragraphNode = linearResult.Paragraphs.Find(paragraph);

                var paragraphVerseRelations = FindParagraphVerseRelations(paragraphNode);

                for (var currentVerseIndex = 0; currentVerseIndex < paragraph.ParagraphResult.VerseEntries.Count; currentVerseIndex++)
                {
                    var verseEntry = paragraphNode.Value.ParagraphResult.VerseEntries[currentVerseIndex];

                    verseRelations.AddRange(ProcessVerseEntryInsideParagraph(verseEntry, currentVerseIndex, paragraphNode));
                    verseRelations.AddRange(ProcessVerseEntryInsideAllDocument(verseEntry, paragraphNode, paragraphVerseRelations));
                }
            }

            return verseRelations;
        }

        private static IEnumerable<VerseRelation> ProcessVerseEntryInsideAllDocument(
            VerseParsing.Models.VerseEntry verseEntry,
            LinkedListNode<ParagraphParseResultExt> paragraphNode,
            IEnumerable<VerseRelation> paragraphVerseRelations)
        {
            return paragraphVerseRelations.SelectMany(vr =>
            {
                return verseEntry.VersePointer.SubVerses.Verses.Select(v =>
                {
                    var verseRelation = vr.Clone();
                    verseRelation.VerseId = v.GetVerseId();
                    return verseRelation;
                });
            });
        }

        private IEnumerable<VerseRelation> FindParagraphVerseRelations(LinkedListNode<ParagraphParseResultExt> paragraphNode)
        {
            var result = new List<VerseRelation>();

            var nextNode = paragraphNode.Next;
            while (nextNode != null)
            {
                var relationWeight = GetParagraphsWeight(paragraphNode, nextNode);

                result.AddRange(nextNode.Value.ParagraphResult.VerseEntries.SelectMany(ve =>
                {
                    return ve.VersePointer.SubVerses.Verses.Select(v =>
                    {
                        return new VerseRelation()
                        {
                            RelativeVerseId = v.GetVerseId(),
                            DocumentParagraph = paragraphNode.Value.ParagraphResult.Paragraph,
                            DocumentParagraphId = paragraphNode.Value.ParagraphResult.Paragraph.Id,
                            RelativeDocumentParagraph = nextNode.Value.ParagraphResult.Paragraph,
                            RelativeDocumentParagraphId = nextNode.Value.ParagraphResult.Paragraph.Id,
                            RelationWeight = relationWeight
                        };
                    });
                }));

                nextNode = nextNode.Next;
            }

            return result;
        }

        private decimal GetParagraphsWeight(LinkedListNode<ParagraphParseResultExt> node, LinkedListNode<ParagraphParseResultExt> relationNode)
        {
            var minWeight = 0.01M;

            if (relationNode.Value.Depth < node.Value.Depth)
                return minWeight;

            var result = 0.5M;

            var nextNode = node.Next;
            while (nextNode != relationNode && result > minWeight)
            {
                if (nextNode.Value.Depth >= node.Value.Depth)
                {
                    result = result / 2;
                }
                else
                {
                    result = minWeight;
                    break;
                }

                nextNode = nextNode.Next;
            }

            if (result < minWeight)
                result = minWeight;

            return result;
        }

        private IEnumerable<VerseRelation> ProcessVerseEntryInsideParagraph(
            VerseParsing.Models.VerseEntry verseEntry,
            int currentVerseIndex,
            LinkedListNode<ParagraphParseResultExt> paragraphNode)
        {
            var result = new List<VerseRelation>();

            for (var i = currentVerseIndex + 1; i < paragraphNode.Value.ParagraphResult.VerseEntries.Count; i++)
            {
                var verseRelations = verseEntry.VersePointer.SubVerses.Verses.SelectMany(v =>
                {
                    var relativeVerseEntry = paragraphNode.Value.ParagraphResult.VerseEntries[i];
                    return relativeVerseEntry.VersePointer.SubVerses.Verses.Select(rv =>
                        new VerseRelation()
                        {
                            VerseId = v.GetVerseId(),
                            RelativeVerseId = rv.GetVerseId(),
                            DocumentParagraph = paragraphNode.Value.ParagraphResult.Paragraph,
                            DocumentParagraphId = paragraphNode.Value.ParagraphResult.Paragraph.Id,
                            RelativeDocumentParagraph = paragraphNode.Value.ParagraphResult.Paragraph,
                            RelativeDocumentParagraphId = paragraphNode.Value.ParagraphResult.Paragraph.Id,
                            RelationWeight = GetWithinParagraphRelationWeight(verseEntry, relativeVerseEntry)
                        });
                });
                result.AddRange(verseRelations);
            }

            return result;
        }

        private static decimal GetWithinParagraphRelationWeight(VerseParsing.Models.VerseEntry verseEntry, VerseParsing.Models.VerseEntry relativeVerseEntry)
        {
            var distance = relativeVerseEntry.StartIndex - verseEntry.EndIndex;
            if (distance < 5)
                return 1;
            else if (distance < 50)
                return 0.8M;
            else
                return 1M / distance * 40;
        }
    }
}
