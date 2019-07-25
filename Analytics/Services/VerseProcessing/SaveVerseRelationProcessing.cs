using System;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;

namespace BibleNote.Analytics.Services.VerseProcessing
{
    class SaveVerseRelationProcessing : IDocumentParseResultProcessing
    {
        public int Order => 1;

        public void Process(int documentId, DocumentParseResult documentResult)
        {
            throw new NotImplementedException();
        }
    }
}
