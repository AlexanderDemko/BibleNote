using BibleNote.Analytics.Domain.Enums;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Tests.Analytics.Mocks
{
    public class MockDocumentProviderInfo : IDocumentProviderInfo
    {
        private readonly IVerseLinkService verseLinkService;

        public bool IsReadonly { get; set; }

        public FileType[] SupportedFileTypes => throw new System.NotImplementedException();

        public MockDocumentProviderInfo(IVerseLinkService verseLinkService)
        {
            this.verseLinkService = verseLinkService;
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            var verseLink = this.verseLinkService.GetVerseLink(versePointer);
            return string.Format($"<a href='{verseLink}'>{versePointer.GetOriginalVerseString()}</a>");
        }        
    }
}
