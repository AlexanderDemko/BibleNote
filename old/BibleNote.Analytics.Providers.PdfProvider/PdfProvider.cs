using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing.ParseResult;
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
