using System;
using System.Threading.Tasks;
using BibleNote.Domain.Enums;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Providers.Pdf
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
