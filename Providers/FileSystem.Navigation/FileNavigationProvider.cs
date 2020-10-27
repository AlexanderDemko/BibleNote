using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Providers.FileSystem.DocumentId;
using BibleNote.Providers.Html;
using BibleNote.Providers.Pdf;
using BibleNote.Providers.Word;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.NavigationProvider;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.FileSystem.Navigation
{
    /// <summary>
    /// Folder with files: .txt, .html, .docx, .pdf.
    /// </summary>
    public class FileNavigationProvider : NavigationProviderBase<FileDocumentId, FileNavigationProviderParameters>
    {
        public override string Name { get; set; }
        public override string Description { get; set; }
        public override bool IsReadonly { get; set; }
        public override FileNavigationProviderParameters Parameters { get; set; }

        private readonly IServiceProvider serviceProvider;
        private readonly ITrackingDbContext dbContext;

        public FileNavigationProvider(
            IServiceProvider serviceProvider,
            ITrackingDbContext dbContext)
        {
            this.serviceProvider = serviceProvider;
            this.dbContext = dbContext;
            this.Parameters = new FileNavigationProviderParameters();
        }

        public override IDocumentProvider GetProvider(FileDocumentId document)
        {
            var fileType = FileTypeHelper.GetFileType(document.FilePath);

            switch (fileType)
            {
                case FileType.Html:
                case FileType.Text:
                    return this.serviceProvider.GetService<HtmlProvider>();
                case FileType.Word:
                    return this.serviceProvider.GetService<WordProvider>();
                case FileType.Pdf:
                    return this.serviceProvider.GetService<PdfProvider>();
                default:
                    throw new NotSupportedException(fileType.ToString());
            }
        }

        public override async Task<IEnumerable<FileDocumentId>> LoadDocuments(bool newOnly, bool updateDb = true, CancellationToken cancellationToken = default)
        {
            var documents = new List<Document>();

            foreach (var folder in Parameters.FolderPaths)
            {
                var folderDocuments = GetFolderDocuments(folder, null, newOnly);
                documents.AddRange(folderDocuments);
            }
            
            if (updateDb)
                await this.dbContext.SaveChangesAsync(cancellationToken);

            return documents.Select(d => new FileDocumentId(d.Id, d.Path, IsReadonly));
        }

        private IEnumerable<Document> GetFolderDocuments(string folderPath, DocumentFolder parentFolder, bool newOnly)
        {
            var result = new List<Document>();
            var folders = GetSubFolders(folderPath, parentFolder);

            foreach (var folder in folders)
            {
                var files = Directory
                    .GetFiles(folder.Path, "*", SearchOption.TopDirectoryOnly)
                    .Where(f => FileTypeHelper.SupportedFileExtensions.Contains(Path.GetExtension(f)));

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

                    if (!newOnly || dbFile.Id <= 0) // По непонятным причинам EF Core для нового файла выставляет Id = -2147482647
                        result.Add(dbFile);
                }

                result.AddRange(GetFolderDocuments(folder.Path, folder, newOnly));
            }

            return result;
        }

        private List<DocumentFolder> GetSubFolders(string folderPath, DocumentFolder parentFolder)
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
                        Path = folder,
                        NavigationProviderName = nameof(FileNavigationProvider)
                    };

                    this.dbContext.DocumentFolderRepository.Add(dbFolder);                    
                }

                result.Add(dbFolder);
            }

            return result;
        }
    }
}
