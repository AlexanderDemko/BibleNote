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

        private readonly ITrackingDbContext dbContext;
        private int documentId;

        public SaveVerseEntriesProcessing(ITrackingDbContext analyticsContext)
        {
            this.dbContext = analyticsContext;            
        }

        public async Task ProcessAsync(int documentId, DocumentParseResult documentResult, CancellationToken cancellationToken = default)
        {
            this.documentId = documentId;            
            
            await RemovePreviousResultAsync();
            ProcessHierarchy(documentResult.RootHierarchyResult);

            await this.dbContext.SaveChangesAsync(cancellationToken);
        }

        private async Task RemovePreviousResultAsync()
        {
            await this.dbContext.VerseRelationRepository
                .DeleteAsync(v => v.DocumentParagraph.DocumentId == this.documentId);

            await this.dbContext.VerseEntryRepository
                .DeleteAsync(v => v.DocumentParagraph.DocumentId == this.documentId);

            await this.dbContext.DocumentParagraphRepository
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
                this.dbContext.DocumentParagraphRepository.Add(paragraphResult.Paragraph);                 

                foreach (var verseEntry in paragraphResult.VerseEntries)
                {
                    var suffix = verseEntry.VersePointer.MultiVerseType == MultiVerse.None
                                    ? null
                                    : $"({verseEntry.VersePointer.GetFullVerseNumberString()})";

                    foreach (var verse in verseEntry.VersePointer.SubVerses.Verses)
                    {
                        this.dbContext.VerseEntryRepository
                            .Add(new VerseEntry()
                            {
                                DocumentParagraph = paragraphResult.Paragraph,
                                Suffix = suffix,
                                VerseId = verse.GetVerseId(),
                                Weight = Math.Round(1M / verseEntry.VersePointer.SubVerses.VersesCount, 2)
                            });
                    }
                }                
            }

            foreach (var childHierarchy in hierarchyResult.ChildHierarchyResults)
                ProcessHierarchy(childHierarchy);
        }       
    }
}
