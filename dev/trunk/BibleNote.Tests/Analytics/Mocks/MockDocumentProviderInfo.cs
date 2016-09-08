using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Verse;
using BibleNote.Analytics.Models.VerseParsing;
using System;

namespace BibleNote.Tests.Analytics.Mocks
{
    public class MockDocumentProviderInfo : IDocumentProviderInfo
    {
        public bool IsReadonly { get; set; }        

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
        }        
    }
}
