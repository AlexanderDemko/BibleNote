using System.Collections.Generic;

namespace BibleNote.Analytics.Domain.Contracts
{
    public interface IBulkUnitOfWork
    {
        void BulkInsert<T>(IEnumerable<T> items) where T : class;
        void BulkUpdate<T>(IEnumerable<T> items) where T : class;
        void BulkDelete<T>(IEnumerable<T> items) where T : class;
        void BulkSaveChanges<T>() where T : class;
    }
}
