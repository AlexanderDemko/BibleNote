namespace BibleNote.Analytics.Domain.Contracts
{
    public interface IDbContext: IRepositoryContainer, IUnitOfWork, IBulkUnitOfWork
    {
    }
}
