using BibleNote.Analytics.Domain.Enums;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.Pdf
{
    public class PdfProvider : IDocumentProvider
    {
        public bool IsReadonly { get { return true; } }

        public FileType[] SupportedFileTypes => new [] { FileType.Pdf };

        public string GetVersePointerLink(VersePointer versePointer)
        {
            throw new NotImplementedException(); // todo
        }

        public Task<DocumentParseResult> ParseDocumentAsync(IDocumentId documentId)
        {
            throw new NotImplementedException(); // todo
        }
    }
}
