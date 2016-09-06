using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Providers.FileNavigationProvider;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public class LocalHtmlProvider : IDocumentProvider
    {
        private readonly IDocumentParserFactory _documentParserFactory;

        public bool IsReadonly
        {
            get { return false; }  // а почему вообще localHtmlProvider должен отличаться от webHtmlProvider? Локальные html файлы лучше тоже не менять, а преобразовывать при отображении только.
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
        }

        public LocalHtmlProvider(IDocumentParserFactory documentParserFactory)
        {
            _documentParserFactory = documentParserFactory;
        }

        public DocumentParseResult ParseDocument(IDocumentId documentId)
        {
            if (!(documentId is FileDocumentId))
                throw new InvalidOperationException("Only FileDocumentId is supported for HtmlProvider.");

            var result = new DocumentParseResult();

            var html = File.ReadAllText(((FileDocumentId)documentId).FilePath);
            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(html);

            using (var docParser = _documentParserFactory.Create(this))
            {
                using (docParser.ParseParagraph(htmlDoc.DocumentNode))
                {
                    
                }                
            }

            return result;
        }
    }
}
