using System;

namespace BibleNote.Analytics.Contracts
{
    /// <summary>
    /// Загруженные данные должны быть закэшированы.
    /// </summary>
    public interface IConfigurationManager
    {   
        string ModuleShortName { get; set; }

        bool UseCommaDelimiter { get; set; }

        void SaveChanges();
    }
}
