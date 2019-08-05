using System;
using BibleNote.Analytics.Data.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using BibleNote.Analytics.Services.VerseProcessing.Models;

namespace BibleNote.Analytics.Services.VerseProcessing
{
    class SaveVerseRelationProcessing : IDocumentParseResultProcessing
    {
        public int Order => 1;

        public SaveVerseRelationProcessing(IDbContext analyticsContext)
        {
            this.analyticsContext = analyticsContext;
        }

        public void Process(int documentId, DocumentParseResult documentResult)
        {   
            ProcessHierarchy(documentResult.RootHierarchyResult);

            this.analyticsContext.SaveChanges();
        }

        readonly IDbContext analyticsContext;             

        private void ProcessHierarchy(HierarchyParseResult hierarchyResult)
        {
            var linearResult = LinearParseResult.FromHierarchyParseResult(hierarchyResult);

            foreach (var paragraphResult in hierarchyResult.ParagraphResults)
            {   
                foreach (var verseEntry in paragraphResult.VerseEntries)
                {
                    foreach (var verse in verseEntry.VersePointer.SubVerses.Verses)
                    {
                        

                        
                    }
                }                
            }

            foreach (var childHierarchy in hierarchyResult.ChildHierarchyResults)
                ProcessHierarchy(childHierarchy);
        }
    }
}
