using System;

namespace BibleNote.Services.Configuration.Contracts
{
    /// <summary>
    /// Загруженные данные должны быть закэшированы
    /// </summary>
    public interface IConfigurationManager
    {
        string ModuleShortName { get; set; }

        bool UseCommaDelimiter { get; set; }

        int Language { get; set; }

        IDisposable UseTemporarySettings(string moduleShortName, bool? useCommaDelimiter = null);

        void SaveChanges();
    }
}
