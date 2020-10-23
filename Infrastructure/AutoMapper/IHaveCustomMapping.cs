using AutoMapper;

namespace BibleNote.UI.Infrastructure.AutoMapper
{
    public interface IHaveCustomMapping
    {
        void CreateMappings(Profile configuration);
    }
}
