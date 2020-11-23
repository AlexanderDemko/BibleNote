using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Services.Contracts;

namespace BibleNote.Services.NavigationProvider
{
    public abstract class NavigationProviderBase<T, P> : INavigationProvider<T>
        where T : IDocumentId
        where P : INavigationProviderParameters
    {
        protected ITrackingDbContext DbContext { get; private set; }

        protected NavigationProviderBase(ITrackingDbContext dbContext)
        {
            DbContext = dbContext;
        }

        public abstract NavigationProviderType Type { get; }

        public abstract int Id { get; set; }

        public abstract string Name { get; set; }

        public abstract string Description { get; set; }

        public abstract bool IsReadonly { get; set; }

        public P Parameters { get; set; }        
      
        public abstract IDocumentProvider GetProvider(T document);

        public abstract Task<IEnumerable<T>> LoadDocuments(
            AnalysisSession analysisSession,
            bool newOnly = false,
            bool updateDb = true, 
            CancellationToken cancellationToken = default);

        public virtual void SetParameters(NavigationProviderInfo navigationProviderInfo)
        {
            if (navigationProviderInfo.Type != Type)
                throw new InvalidOperationException($"Invalid navigationProviderInfo.Type: {navigationProviderInfo.Type} != {Type}");

            this.Id = navigationProviderInfo.Id;
            this.Name = navigationProviderInfo.Name;
            this.Description = navigationProviderInfo.Description;
            this.IsReadonly = navigationProviderInfo.IsReadonly;
            this.Parameters = NavigationProviderParametersBase.ReadParameters<P>(navigationProviderInfo.ParametersRaw);
        }

        protected async Task SaveChanges(AnalysisSession analysisSession, CancellationToken cancellationToken)
        {
            await DbContext.SaveChangesAsync(cancellationToken);
            analysisSession.DeletedDocumentsCount = await DbContext.DocumentRepository
                .Where(d => d.Folder.NavigationProviderId == Id
                        && d.LatestAnalysisSessionId != analysisSession.Id)
                .CountAsync(cancellationToken);

            await DbContext.VerseRelationRepository.DeleteAsync(
                v => v.DocumentParagraph.Document.Folder.NavigationProviderId == Id 
                && v.DocumentParagraph.Document.LatestAnalysisSessionId != analysisSession.Id,
                cancellationToken);
            
            await DbContext.VerseEntryRepository.DeleteAsync(
                v => v.DocumentParagraph.Document.Folder.NavigationProviderId == Id 
                && v.DocumentParagraph.Document.LatestAnalysisSessionId != analysisSession.Id,
                cancellationToken);
            
            await DbContext.DocumentParagraphRepository.DeleteAsync(
                p => p.Document.Folder.NavigationProviderId == Id
                && p.Document.LatestAnalysisSessionId != analysisSession.Id,
                cancellationToken);

            await DbContext.DocumentRepository.DeleteAsync(
                d => d.Folder.NavigationProviderId == Id 
                && d.LatestAnalysisSessionId != analysisSession.Id,
                cancellationToken);
            
            await DbContext.DocumentFolderRepository.DeleteAsync(
                f => f.NavigationProviderId == Id
                && f.LatestAnalysisSessionId != analysisSession.Id,
                cancellationToken);
        }
    }
}
