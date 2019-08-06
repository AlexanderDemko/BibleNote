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

            ProcessLinearResult(linearResult);

            this.analyticsContext.SaveChanges();
        }

        private void ProcessLinearResult(LinearParseResult linearResult)
        {
            foreach (var paragraph in linearResult.Paragraphs)
            {
                var paragraphNode = linearResult.Paragraphs.Find(paragraph);

                for (var currentVerseIndex = 0; currentVerseIndex < paragraph.ParagraphResult.VerseEntries.Count; currentVerseIndex++)
                {
                    ProcessVerse(paragraphNode, currentVerseIndex);

                }
            }            
        }

        private void ProcessVerse(LinkedListNode<ParagraphParseResultExt> paragraphNode, int currentVerseIndex)
        {
            var verseEntry = paragraphNode.Value.ParagraphResult.VerseEntries[currentVerseIndex];

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
                            RelationWeight = GetWithinParagraphRelationWeight(verseEntry, relativeVerseEntry)
                        });
                });
                this.analyticsContext.VerseRelationRepository.ToTrackingRepository().AddRange(verseRelations);
            }
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
