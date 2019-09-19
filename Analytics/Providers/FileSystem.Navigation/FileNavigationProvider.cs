using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Analytics.Domain.Contracts;
using BibleNote.Analytics.Domain.Entities;
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
        public readonly string[] supportedFileExtensions = new[] { ".txt", ".html", ".doc", ".docx", ".pdf" };

        public string Name { get; set; }
        public string Description { get; set; }
        public bool IsReadonly { get; set; }
        public string FolderPath { get; set; }

        private readonly IServiceProvider serviceProvider;
        private readonly ITrackingDbContext dbContext;

        public FileNavigationProvider(
            IServiceProvider serviceProvider,
            ITrackingDbContext dbContext)
        {
            this.serviceProvider = serviceProvider;
            this.dbContext = dbContext;
        }

        public IDocumentProvider GetProvider(FileDocumentId document)
        {
            var ext = Path.GetExtension(document.FilePath);

            switch (ext)
            {
                case ".txt":
                case ".html":
                    return new HtmlProvider(
                        this.serviceProvider.GetService<IDocumentParserFactory>(),
                        this.serviceProvider.GetService<IHtmlDocumentConnector>());
                case ".doc":
                case ".docx":
                    return new WordProvider();
                case ".pdf":
                    return new PdfProvider();
                default:
                    throw new NotImplementedException(ext);
            }
        }

        public async Task<IEnumerable<FileDocumentId>> GetDocuments(bool newOnly, CancellationToken cancellationToken = default)
        {
            var documents = GetFolderDocuments(FolderPath, null, newOnly);
            await this.dbContext.SaveChangesAsync(cancellationToken);

            return documents.Select(d => new FileDocumentId(d.Id, d.Path, IsReadonly));
        }

        public IEnumerable<Document> GetFolderDocuments(string folderPath, DocumentFolder parentFolder, bool newOnly)
        {
            var result = new List<Document>();
            var folders = GetRootFolders(folderPath, parentFolder);

            foreach (var folder in folders)
            {
                var files = Directory
                    .GetFiles(folder.Path, "*", SearchOption.TopDirectoryOnly)
                    .Where(f => this.supportedFileExtensions.Contains(Path.GetExtension(f)));

                foreach (var file in files)
                {
                    var dbFile = this.dbContext.DocumentRepository.SingleOrDefault(d => d.Path == file);
                    if (dbFile == null)
                    {
                        dbFile = new Document()
                        {
                            Folder = folder,
                            Name = Path.GetFileName(file),
                            Path = file                            
                        };

                        this.dbContext.DocumentRepository.Add(dbFile);
                            
                    }

                    if (!newOnly || dbFile.Id == default)
                        result.Add(dbFile);
                }

                result.AddRange(GetFolderDocuments(folder.Path, folder, newOnly));
            }

            return result;
        }

        private List<DocumentFolder> GetRootFolders(string folderPath, DocumentFolder parentFolder)
        {
            var result = new List<DocumentFolder>();
            var folders = Directory.GetDirectories(folderPath, "*", SearchOption.TopDirectoryOnly);

            foreach (var folder in folders)
            {
                var dbFolder = this.dbContext.DocumentFolderRepository.SingleOrDefault(f => f.Path == folder);
                if (dbFolder == null)
                {
                    dbFolder = new DocumentFolder()
                    {
                        Name = Path.GetFileName(folder),
                        ParentFolder = parentFolder,
                        Path = folder
                    };

                    this.dbContext.DocumentFolderRepository.Add(dbFolder);                    
                }

                result.Add(dbFolder);
            }

            return result;
        }
    }
}
