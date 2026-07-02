using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using BibleNote.Services.Contracts;
using BibleNote.Services.NavigationProvider;
using static BibleNote.Providers.OneNote.Services.NavigationProvider.NotebookIterator;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteNavigationProvider : NavigationProviderBase<OneNoteDocumentId, OneNoteNavigationProviderParameters>
    {
        private readonly OneNoteProvider oneNoteProvider;
        private readonly INotebookIterator notebookIterator;

        public override NavigationProviderType Type => NavigationProviderType.OneNote;
        public override int Id { get; set; }
        public override string Name { get; set; }
        public override string Description { get; set; }
        public override bool IsReadonly { get; set; }

        public OneNoteNavigationProvider(
            OneNoteProvider oneNoteProvider, 
            INotebookIterator notebookIterator,
            ITrackingDbContext dbContext) 
            : base(dbContext)
        {
            Parameters = new OneNoteNavigationProviderParameters();
            this.oneNoteProvider = oneNoteProvider;
            this.notebookIterator = notebookIterator;
        }

        public override IDocumentProvider GetProvider(OneNoteDocumentId document)
        {
            return this.oneNoteProvider;
        }

        public override async Task<IEnumerable<OneNoteDocumentId>> LoadDocuments(
            AnalysisSession analysisSession, 
            bool newOnly = false, 
            bool updateDb = true, 
            CancellationToken cancellationToken = default)
        {
            var documents = new List<Document>();

            foreach (var item in Parameters.HierarchyItems)
            {
                var hierarchyInfo = await this.notebookIterator.GetHierarchyPagesAsync(item.Id, item.Type);
                var hierarchyDocuments = GetHierarchyDocuments(analysisSession, new[] { hierarchyInfo }, null, newOnly);
                documents.AddRange(hierarchyDocuments);
            }

            await DbContext.DoInTransactionAsync(async (cancellationToken) =>
            {
                await SaveChanges(analysisSession, cancellationToken);
                return updateDb;
            }, cancellationToken);

            return documents.Select(d => new OneNoteDocumentId(d.Id, d.Path));
        }

        private IEnumerable<Document> GetHierarchyDocuments(
            AnalysisSession analysisSession, 
            IEnumerable<ContainerInfo> containerInfos, 
            DocumentFolder parentFolder, 
            bool newOnly)
        {
            if (newOnly)
                throw new NotSupportedException($"{nameof(newOnly)} is for WebNavigationProvider only");

            var result = new List<Document>();
            var documentFolders = GetDocumentFolders(analysisSession, containerInfos, parentFolder);

            foreach (var dFolderKVP in documentFolders)
            {
                foreach (var pageInfo in dFolderKVP.Value.Pages)
                {
                    var document = DbContext.DocumentRepository.SingleOrDefault(d => d.Path == pageInfo.Id);
                    if (document == null)
                    {
                        document = new Document()
                        {
                            Folder = dFolderKVP.Key,
                            Name = pageInfo.Name,
                            Path = pageInfo.Id,
                            LastModifiedTime = pageInfo.LastModifiedTime,
                        };

                        DbContext.DocumentRepository.Add(document);
                        analysisSession.CreatedDocumentsCount++;
                    }
                    else
                    {
                        if (document.LastModifiedTime != pageInfo.LastModifiedTime)
                        {
                            document.LastModifiedTime = pageInfo.LastModifiedTime;
                            analysisSession.UpdatedDocumentsCount++;
                        }
                    }

                    document.LatestAnalysisSession = analysisSession;

                    if (!newOnly || document.Id <= 0) // По непонятным причинам EF Core для нового файла выставляет Id = -2147482647
                        result.Add(document);
                }

                result.AddRange(GetHierarchyDocuments(analysisSession, dFolderKVP.Value.ChildrenContainers, dFolderKVP.Key, newOnly));
            }

            return result;
        }

        private Dictionary<DocumentFolder, ContainerInfo> GetDocumentFolders(
            AnalysisSession analysisSession, 
            IEnumerable<ContainerInfo> containerInfos, 
            DocumentFolder parentFolder)
        {
            var result = new Dictionary<DocumentFolder, ContainerInfo>();

            foreach (var container in containerInfos)
            {
                var documentFolder = DbContext.DocumentFolderRepository.SingleOrDefault(f => f.Path == container.Id);
                if (documentFolder == null)
                {
                    documentFolder = new DocumentFolder()
                    {
                        Name = container.Name,
                        ParentFolder = parentFolder,
                        Path = container.Id,
                        NavigationProviderId = Id
                    };

                    DbContext.DocumentFolderRepository.Add(documentFolder);
                }

                documentFolder.LatestAnalysisSession = analysisSession;

                result.Add(documentFolder, container);
            }

            return result;
        }
    }
}
