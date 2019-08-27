using BibleNote.Analytics.Domain.Contracts;
using BibleNote.Analytics.Domain.Entities;
using BibleNote.Analytics.Services.ModulesManager.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using System;

namespace BibleNote.Analytics.Services.VerseProcessing
{
    class SaveVerseEntriesProcessing : IDocumentParseResultProcessing
    {
        public int Order => 0;

        public SaveVerseEntriesProcessing(IDbContext analyticsContext)
        {
            this.analyticsContext = analyticsContext;            
        }

        public void Process(int documentId, DocumentParseResult documentResult)
        {
            this.documentId = documentId;            
            
            RemovePreviousResult();
            ProcessHierarchy(documentResult.RootHierarchyResult);

            this.analyticsContext.SaveChanges();
        }

        private readonly IDbContext analyticsContext;        
        private int documentId;
        private int insertedRows = 0;

        private void RemovePreviousResult()
        {
            this.analyticsContext.VerseRelationRepository.ToTrackingRepository()
                .Delete(v => v.DocumentParagraph.DocumentId == this.documentId);

            this.analyticsContext.VerseEntryRepository.ToTrackingRepository()
                .Delete(v => v.DocumentParagraph.DocumentId == this.documentId);

            this.analyticsContext.DocumentParagraphRepository.ToTrackingRepository()
                .Delete(p => p.DocumentId == documentId);            
        }

        private void ProcessHierarchy(HierarchyParseResult hierarchyResult)
        {
            foreach (var paragraphResult in hierarchyResult.ParagraphResults)
            {
                paragraphResult.Paragraph = new DocumentParagraph()
                {
                    DocumentId = this.documentId,
                    Index = paragraphResult.ParagraphIndex,
                    Path = paragraphResult.ParagraphPath
                };
                this.analyticsContext.DocumentParagraphRepository.ToTrackingRepository().Add(paragraphResult.Paragraph);                 

                foreach (var verseEntry in paragraphResult.VerseEntries)
                {
                    var suffix = verseEntry.VersePointer.IsMultiVerse == MultiVerse.None
                                    ? null
                                    : $"({verseEntry.VersePointer.GetFullVerseNumberString()})";

                    foreach (var verse in verseEntry.VersePointer.SubVerses.Verses)
                    {
                        this.analyticsContext.VerseEntryRepository.ToTrackingRepository()
                            .Add(new VerseEntry()
                            {
                                DocumentParagraph = paragraphResult.Paragraph,
                                Suffix = suffix,
                                VerseId = verse.GetVerseId(),
                                Weight = Math.Round(1M / verseEntry.VersePointer.SubVerses.VersesCount, 2)
                            });

                        this.insertedRows++;                        
                    }
                }                
            }

            foreach (var childHierarchy in hierarchyResult.ChildHierarchyResults)
                ProcessHierarchy(childHierarchy);
        }       
    }
}
