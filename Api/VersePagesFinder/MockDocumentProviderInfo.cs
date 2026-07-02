using BibleNote.Domain.Enums;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models;

namespace BibleNote.VersePagesFinder
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
