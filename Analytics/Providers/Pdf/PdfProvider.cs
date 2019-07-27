using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System;

namespace BibleNote.Analytics.Providers.Pdf
{
    public class PdfProvider : IDocumentProvider
    {
        public bool IsReadonly { get { return true; } }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            throw new NotImplementedException();
        }

        public DocumentParseResult ParseDocument(IDocumentId documentId)
        {
            throw new NotImplementedException();
        }
    }
}
