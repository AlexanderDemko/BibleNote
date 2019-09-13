using System;
using System.Collections.Generic;
using System.IO;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Providers.Pdf;
using BibleNote.Analytics.Providers.Word;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Analytics.Providers.FileSystem.Navigation
{
    /// <summary>
    /// Folder with files .txt, .html, .docx, .doc.
    /// </summary>
    public class FileNavigationProvider : INavigationProvider<FileDocumentId>
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public bool IsReadonly { get; set; }

        private readonly IServiceProvider scopeProvider;

        public FileNavigationProvider(IServiceProvider scopeProvider)
        {
            this.scopeProvider = scopeProvider;
        }

        public IDocumentProvider GetProvider(FileDocumentId document)
        {
            var ext = Path.GetExtension(document.FilePath);

            switch (ext)
            {
                case ".txt":
                case ".html":
                    return new HtmlProvider(
                        this.scopeProvider.GetService<IDocumentParserFactory>(),
                        this.scopeProvider.GetService<IHtmlDocumentConnector>());
                case ".doc":
                case ".docx":
                    return new WordProvider();
                case ".pdf":
                    return new PdfProvider();
                default:
                    throw new NotImplementedException(ext);
            }
        }

        public IEnumerable<FileDocumentId> GetDocuments(bool newOnly)
        {
            throw new NotImplementedException();
        }        
    }
}
