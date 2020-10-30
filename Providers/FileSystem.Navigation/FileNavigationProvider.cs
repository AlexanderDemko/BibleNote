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
        public override int Id { get; set; }
        public override string Name { get; set; }
        public override string Description { get; set; }
        public override bool IsReadonly { get; set; }
        public override FileNavigationProviderParameters Parameters { get; set; }

        private readonly IServiceProvider serviceProvider;

        public FileNavigationProvider(
            IServiceProvider serviceProvider,
            ITrackingDbContext dbContext) : base(dbContext)
        {
            this.serviceProvider = serviceProvider;
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

        public override async Task<IEnumerable<FileDocumentId>> LoadDocuments(
            AnalysisSession analysisSession, 
            bool newOnly, 
            bool updateDb = true, 
            CancellationToken cancellationToken = default)
        {
            var documents = new List<Document>();

            foreach (var folder in Parameters.FolderPaths)
            {
                var folderDocuments = GetFolderDocuments(analysisSession, folder, null, newOnly);
                documents.AddRange(folderDocuments);
            }

            if (updateDb)
            {
                await SaveChanges(analysisSession, cancellationToken);
            }

            return documents.Select(d => new FileDocumentId(d.Id, d.Path, IsReadonly));
        }        

        private IEnumerable<Document> GetFolderDocuments(AnalysisSession analysisSession, string folderPath, DocumentFolder parentFolder, bool newOnly)
        {
            var result = new List<Document>();
            var folders = GetSubFolders(analysisSession, folderPath, parentFolder);

            foreach (var folder in folders)
            {
                var files = Directory
                    .GetFiles(folder.Path, "*", SearchOption.TopDirectoryOnly)
                    .Where(f => FileTypeHelper.SupportedFileExtensions.Contains(Path.GetExtension(f)));

                foreach (var filePath in files)
                {
                    var lastModifiedTime = File.GetLastWriteTime(filePath);
                    var dbFile = DbContext.DocumentRepository.SingleOrDefault(d => d.Path == filePath);
                    if (dbFile == null)
                    {
                        dbFile = new Document()
                        {
                            Folder = folder,
                            Name = Path.GetFileName(filePath),
                            Path = filePath,
                            LastModifiedTime = lastModifiedTime
                        };

                        DbContext.DocumentRepository.Add(dbFile);
                        analysisSession.CreatedDocumentsCount++;
                    }
                    else
                    {
                        if (dbFile.LastModifiedTime != lastModifiedTime)
                        {
                            dbFile.LastModifiedTime = lastModifiedTime;
                            analysisSession.UpdatedDocumentsCount++;
                        }
                    }

                    dbFile.LatestAnalysisSessionId = analysisSession.Id;

                    if (!newOnly || dbFile.Id <= 0) // По непонятным причинам EF Core для нового файла выставляет Id = -2147482647
                        result.Add(dbFile);
                }

                result.AddRange(GetFolderDocuments(analysisSession, folder.Path, folder, newOnly));
            }

            return result;
        }

        private List<DocumentFolder> GetSubFolders(AnalysisSession analysisSession, string folderPath, DocumentFolder parentFolder)
        {
            var result = new List<DocumentFolder>();
            var folders = Directory.GetDirectories(folderPath, "*", SearchOption.TopDirectoryOnly);

            foreach (var folder in folders)
            {
                var dbFolder = DbContext.DocumentFolderRepository.SingleOrDefault(f => f.Path == folder);
                if (dbFolder == null)
                {
                    dbFolder = new DocumentFolder()
                    {
                        Name = Path.GetFileName(folder),
                        ParentFolder = parentFolder,
                        Path = folder,
                        NavigationProviderId = Id
                    };

                    DbContext.DocumentFolderRepository.Add(dbFolder);                    
                }

                dbFolder.LatestAnalysisSessionId = analysisSession.Id;

                result.Add(dbFolder);
            }

            return result;
        }
    }
}
