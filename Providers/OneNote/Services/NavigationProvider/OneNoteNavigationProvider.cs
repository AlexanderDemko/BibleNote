using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.NavigationProvider;
using static BibleNote.Providers.OneNote.Services.NavigationProvider.NotebookIterator;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class OneNoteNavigationProvider : NavigationProviderBase<OneNoteDocumentId, OneNoteNavigationProviderParameters>
    {
        private readonly OneNoteProvider oneNoteProvider;
        private readonly INotebookIterator notebookIterator;

        public override int Id { get; set; }
        public override string Name { get; set; }
        public override string Description { get; set; }
        public override bool IsReadonly { get; set; }
        public override OneNoteNavigationProviderParameters Parameters { get; set; }


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
            bool newOnly, 
            bool updateDb = true, 
            CancellationToken cancellationToken = default)
        {
            var documents = new List<Document>();

            foreach (var item in Parameters.HierarchyItems)
            {
                var hierarchyInfo = await this.notebookIterator.GetHierarchyPagesAsync(item.Id, item.Type);
                var hierarchyDocuments = GetHierarchyDocuments(analysisSession, hierarchyInfo, null, newOnly);
                documents.AddRange(hierarchyDocuments);
            }

            if (updateDb)
            {
                await SaveChanges(analysisSession, cancellationToken);
            }

            return documents.Select(d => new OneNoteDocumentId(d.Id, d.Path));
        }

        private IEnumerable<Document> GetHierarchyDocuments(AnalysisSession analysisSession, ContainerInfo containerInfo, DocumentFolder parentFolder, bool newOnly)
        {
            var result = new List<Document>();
            var childContainers = GetChildContainers(analysisSession, containerInfo, parentFolder);

            foreach (var childContainerInfo in childContainers)
            {
                foreach (var page in childContainerInfo.Value.Pages)
                {
                    var dbFile = DbContext.DocumentRepository.SingleOrDefault(d => d.Path == page.Id);
                    if (dbFile == null)
                    {
                        dbFile = new Document()
                        {
                            Folder = childContainerInfo.Key,
                            Name = page.Name,
                            Path = page.Id,
                            LastModifiedTime = page.LastModifiedTime,
                        };

                        DbContext.DocumentRepository.Add(dbFile);
                        analysisSession.CreatedDocumentsCount++;
                    }
                    else
                    {
                        if (dbFile.LastModifiedTime != page.LastModifiedTime)
                        {
                            dbFile.LastModifiedTime = page.LastModifiedTime;
                            analysisSession.UpdatedDocumentsCount++;
                        }
                    }

                    dbFile.LatestAnalysisSessionId = analysisSession.Id;

                    if (!newOnly || dbFile.Id <= 0) // По непонятным причинам EF Core для нового файла выставляет Id = -2147482647
                        result.Add(dbFile);
                }

                result.AddRange(GetHierarchyDocuments(analysisSession, childContainerInfo.Value, childContainerInfo.Key, newOnly));
            }

            return result;
        }

        private Dictionary<DocumentFolder, ContainerInfo> GetChildContainers(AnalysisSession analysisSession, ContainerInfo containerInfo, DocumentFolder parentFolder)
        {
            var result = new Dictionary<DocumentFolder, ContainerInfo>();

            foreach (var childContainer in containerInfo.ChildrenContainers)
            {
                var dbFolder = DbContext.DocumentFolderRepository.SingleOrDefault(f => f.Path == childContainer.Id);
                if (dbFolder == null)
                {
                    dbFolder = new DocumentFolder()
                    {
                        Name = childContainer.Name,
                        ParentFolder = parentFolder,
                        Path = childContainer.Id,
                        NavigationProviderId = Id
                    };

                    DbContext.DocumentFolderRepository.Add(dbFolder);
                }

                dbFolder.LatestAnalysisSessionId = analysisSession.Id;

                result.Add(dbFolder, containerInfo);
            }

            return result;
        }
    }
}
