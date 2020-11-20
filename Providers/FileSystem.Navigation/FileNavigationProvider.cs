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
using BibleNote.Services.Contracts;
using BibleNote.Services.NavigationProvider;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.FileSystem.Navigation
{
    /// <summary>
    /// Folder with files: .txt, .html, .docx, .pdf.
    /// </summary>
    public class FileNavigationProvider : NavigationProviderBase<FileDocumentId, FileNavigationProviderParameters>
    {
        public override NavigationProviderType Type => NavigationProviderType.File;
        public override int Id { get; set; }
        public override string Name { get; set; }
        public override string Description { get; set; }
        public override bool IsReadonly { get; set; }

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
                var folderDocuments = GetFolderDocuments(analysisSession, new[] { folder }, null, newOnly);
                documents.AddRange(folderDocuments);
            }

            if (updateDb)
            {
                await SaveChanges(analysisSession, cancellationToken);
            }

            return documents.Select(d => new FileDocumentId(d.Id, d.Path, IsReadonly));
        }        

        private IEnumerable<Document> GetFolderDocuments(AnalysisSession analysisSession, IEnumerable<string> folderPaths, DocumentFolder parentFolder, bool newOnly)
        {
            if (newOnly)
                throw new NotSupportedException($"{nameof(newOnly)} is for WebNavigationProvider only");

            var result = new List<Document>();
            var documentFolders = GetDocumentFolders(analysisSession, folderPaths, parentFolder);

            foreach (var dFolder in documentFolders)
            {
                var files = Directory
                    .GetFiles(dFolder.Path, "*", SearchOption.TopDirectoryOnly)
                    .Where(f => FileTypeHelper.SupportedFileExtensions.Contains(Path.GetExtension(f)));

                foreach (var filePath in files)
                {
                    var lastModifiedTime = File.GetLastWriteTime(filePath);
                    var document = DbContext.DocumentRepository.SingleOrDefault(d => d.Path == filePath);
                    if (document == null)
                    {
                        document = new Document()
                        {
                            Folder = dFolder,
                            Name = Path.GetFileName(filePath),
                            Path = filePath,
                            LastModifiedTime = lastModifiedTime
                        };

                        DbContext.DocumentRepository.Add(document);
                        analysisSession.CreatedDocumentsCount++;
                    }
                    else
                    {
                        if (document.LastModifiedTime != lastModifiedTime)
                        {
                            document.LastModifiedTime = lastModifiedTime;
                            analysisSession.UpdatedDocumentsCount++;
                        }
                    }

                    document.LatestAnalysisSession = analysisSession;

                    if (!newOnly || document.Id <= 0) // По непонятным причинам EF Core для нового файла выставляет Id = -2147482647
                        result.Add(document);
                }

                var subFolderPaths = Directory.GetDirectories(dFolder.Path, "*", SearchOption.TopDirectoryOnly);
                result.AddRange(GetFolderDocuments(analysisSession, subFolderPaths, dFolder, newOnly));
            }

            return result;
        }

        private List<DocumentFolder> GetDocumentFolders(AnalysisSession analysisSession, IEnumerable<string> folderPaths, DocumentFolder parentFolder)
        {
            var result = new List<DocumentFolder>();  

            foreach (var folder in folderPaths)
            {
                var documentFolder = DbContext.DocumentFolderRepository.SingleOrDefault(f => f.Path == folder);
                if (documentFolder == null)
                {
                    documentFolder = new DocumentFolder()
                    {
                        Name = Path.GetFileName(folder),
                        ParentFolder = parentFolder,
                        Path = folder,
                        NavigationProviderId = Id
                    };

                    DbContext.DocumentFolderRepository.Add(documentFolder);                    
                }

                documentFolder.LatestAnalysisSession = analysisSession;

                result.Add(documentFolder);
            }

            return result;
        }
    }
}
