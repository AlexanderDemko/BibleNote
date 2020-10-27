using System;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using BibleNote.Services.VerseProcessing.Contracts;

namespace BibleNote.Services.VerseProcessing
{
    class SaveVerseEntriesProcessing : IDocumentParseResultProcessing
    {
        public int Order => 0;

        public SaveVerseEntriesProcessing(ITrackingDbContext analyticsContext)
        {
            this.analyticsContext = analyticsContext;            
        }

        public async Task ProcessAsync(int documentId, DocumentParseResult documentResult, CancellationToken cancellationToken = default)
        {
            this.documentId = documentId;            
            
            await RemovePreviousResultAsync();
            ProcessHierarchy(documentResult.RootHierarchyResult);

            await this.analyticsContext.SaveChangesAsync(cancellationToken);
        }

        private readonly ITrackingDbContext analyticsContext;        
        private int documentId;
        private int insertedRows = 0;

        private async Task RemovePreviousResultAsync()
        {
            await this.analyticsContext.VerseRelationRepository
                .DeleteAsync(v => v.DocumentParagraph.DocumentId == this.documentId);

            await this.analyticsContext.VerseEntryRepository
                .DeleteAsync(v => v.DocumentParagraph.DocumentId == this.documentId);

            await this.analyticsContext.DocumentParagraphRepository
                .DeleteAsync(p => p.DocumentId == documentId);            
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
                this.analyticsContext.DocumentParagraphRepository.Add(paragraphResult.Paragraph);                 

                foreach (var verseEntry in paragraphResult.VerseEntries)
                {
                    var suffix = verseEntry.VersePointer.MultiVerseType == MultiVerse.None
                                    ? null
                                    : $"({verseEntry.VersePointer.GetFullVerseNumberString()})";

                    foreach (var verse in verseEntry.VersePointer.SubVerses.Verses)
                    {
                        this.analyticsContext.VerseEntryRepository
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
