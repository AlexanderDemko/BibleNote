using BibleNote.Analytics.Contracts.VerseProcessing;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;
using BibleNote.Analytics.Data;
using BibleNote.Analytics.Data.Entities;
using BibleNote.Analytics.Models.Verse;
using System;

namespace BibleNote.Analytics.Services.VerseProcessing
{
    public class SaveVerseEntriesProcessing : IDocumentParseResultProcessing
    {
        private AnalyticsContext _analyticsContext;
        private int _documentId;
        private DocumentParseResult _documentResult;
        private int _insertedRows = 0;

        public SaveVerseEntriesProcessing(AnalyticsContext analyticsContext)
        {
            _analyticsContext = null; //  analyticsContext;
            // todo: check the https://github.com/MikaelEliasson/EntityFramework.Utilities#batch-insert-entities
        }

        public void Process(int documentId, DocumentParseResult documentResult)
        {
            _documentId = documentId;
            _documentResult = documentResult;

            RecreateContextIfNeeded();
            RemovePreviousResult();
            ProcessHierarchy(documentResult.RootHierarchyResult);
            _analyticsContext.SaveChanges();        // todo: revise
            _analyticsContext.Dispose();
        }

        private void RemovePreviousResult()
        {
            _analyticsContext.Database.ExecuteSqlCommand(
                $@"delete from {nameof(_analyticsContext.VerseEntries)}
                   where exists 
                   (
                       select * from {nameof(_analyticsContext.DocumentParagraphs)} p
                       where {nameof(VerseEntry.DocumentParagraphId)} = p.{nameof(DocumentParagraph.DocumentParagraphId)} 
                        and p.{nameof(DocumentParagraph.DocumentId)} = {_documentId} 
                   )");

            _analyticsContext.Database.ExecuteSqlCommand(
                $@"delete from {nameof(_analyticsContext.DocumentParagraphs)}
                   where {nameof(DocumentParagraph.DocumentId)} = {_documentId}");
        }

        private void ProcessHierarchy(HierarchyParseResult hierarchyResult)
        {
            foreach (var paragraphResult in hierarchyResult.ParagraphResults)
            {
                var paragraph = _analyticsContext.DocumentParagraphs.Add(new DocumentParagraph()
                {
                    DocumentId = _documentId,
                    Index = paragraphResult.ParagraphIndex,
                    Path = paragraphResult.ParagraphPath
                });

                foreach (var verseEntry in paragraphResult.VerseEntries)
                {
                    var suffix = verseEntry.VersePointer.IsMultiVerse == MultiVerse.None 
                                    ? string.Empty : $"({verseEntry.VersePointer.GetFullVerseNumberString()})";

                    foreach (var verse in verseEntry.VersePointer.SubVerses.Verses)
                    {
                        _analyticsContext.VerseEntries.Add(new VerseEntry()
                        {
                            DocumentParagraph = paragraph,
                            Suffix = suffix,
                            VerseId = verse.GetVerseDbId()
                        });

                        _insertedRows++;
                        RecreateContextIfNeeded();
                    }
                }
            }

            foreach (var childHierarchy in hierarchyResult.ChildHierarchyResults)
                ProcessHierarchy(childHierarchy);
        }

        private void RecreateContextIfNeeded()
        {
            if (_insertedRows % 100 == 0 || _analyticsContext == null)
            {
                if (_analyticsContext != null)
                {
                    _analyticsContext.SaveChanges();        // todo: SaveChangesAsync()?
                    _analyticsContext.Dispose();
                }

                _analyticsContext = new AnalyticsContext();
                _analyticsContext.Configuration.AutoDetectChangesEnabled = false;
                _analyticsContext.Configuration.ValidateOnSaveEnabled = false;
            }
        }
    }
}
