using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;

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
