using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;

namespace BibleNote.Tests.Analytics.Mocks
{
    public class MockDocumentProvider : IDocumentProvider
    {
        public bool IsReadonly { get; set; }        

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
        }

        public DocumentParseResult ParseDocument(IDocumentId documentId)
        {
            throw new NotImplementedException();
        }
    }
}
