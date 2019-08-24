using BibleNote.Analytics.Data.Contracts;
using BibleNote.Analytics.Data.Entities;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using BibleNote.Analytics.Services.VerseProcessing.Models;
using System;
using System.Collections.Generic;
using System.Linq;

namespace BibleNote.Analytics.Services.VerseProcessing
{
    class SaveVerseRelationProcessing : IDocumentParseResultProcessing
    {
        public int Order => 1;

        public SaveVerseRelationProcessing(IDbContext analyticsContext)
        {
            this.analyticsContext = analyticsContext;
        }

        readonly IDbContext analyticsContext;

        public void Process(int documentId, DocumentParseResult documentResult)
        {
            var linearResult = LinearParseResult.FromHierarchyParseResult(documentResult.RootHierarchyResult);

            var verseRelations = ProcessLinearResult(linearResult);

            this.analyticsContext.VerseRelationRepository.ToTrackingRepository().AddRange(verseRelations);
            this.analyticsContext.SaveChanges();    // todo: перевести на BulkInsert
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

        private IEnumerable<VerseRelation> ProcessVerseEntryInsideAllDocument(
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
                var relationWeight = GetParagraphsWeight(paragraphNode.Value, nextNode.Value);

                result.AddRange(nextNode.Value.ParagraphResult.VerseEntries.SelectMany(ve =>
                {
                    return ve.VersePointer.SubVerses.Verses.Select(v =>
                    {
                        return new VerseRelation()
                        {
                            RelativeVerseId = v.GetVerseId(),
                            DocumentParagraph = paragraphNode.Value.ParagraphResult.Paragraph,
                            RelativeDocumentParagraph = nextNode.Value.ParagraphResult.Paragraph,
                            RelationWeight = relationWeight
                        };
                    });
                }));

                nextNode = paragraphNode.Next;
            }

            return result;
        }

        private decimal GetParagraphsWeight(ParagraphParseResultExt node, ParagraphParseResultExt relationNode)
        {
            throw new NotImplementedException();
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
                            RelationWeight = GetWithinParagraphRelationWeight(verseEntry, relativeVerseEntry)
                        });
                });
                result.AddRange(verseRelations);
            }

            return result;
        }

        private decimal GetWithinParagraphRelationWeight(VerseParsing.Models.VerseEntry verseEntry, VerseParsing.Models.VerseEntry relativeVerseEntry)
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
