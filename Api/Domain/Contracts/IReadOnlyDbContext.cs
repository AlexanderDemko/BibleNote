using BibleNote.Domain.Entities;

namespace BibleNote.Domain.Contracts
{
    public interface IReadOnlyDbContext : IUnitOfWork
    {
        IReadOnlyRepository<Document> DocumentRepository { get; }
        IReadOnlyRepository<DocumentFolder> DocumentFolderRepository { get; }
        IReadOnlyRepository<DocumentParagraph> DocumentParagraphRepository { get; }
        IReadOnlyRepository<VerseEntry> VerseEntryRepository { get; }
        IReadOnlyRepository<VerseRelation> VerseRelationRepository { get; }
        IReadOnlyRepository<NavigationProviderInfo> NavigationProvidersInfo { get; }
        IReadOnlyRepository<AnalysisSession> AnalysisSessions { get; }
    }
}
