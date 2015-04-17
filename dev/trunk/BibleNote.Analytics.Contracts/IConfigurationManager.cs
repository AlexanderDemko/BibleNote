using System;

namespace BibleNote.Analytics.Contracts
{
    public interface IConfigurationManager
    {        
        string ModuleShortName { get; set; }

        bool UseCommaDelimiter { get; set; }

        void SaveChanges();
    }
}
